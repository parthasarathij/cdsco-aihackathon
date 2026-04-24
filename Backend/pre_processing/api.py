import os
import json
import uuid
import shutil
import tempfile
import logging
import zipfile
from pathlib import Path
from typing import Optional, List

import fitz  
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ocr.pipeline import DocumentPipeline
from ocr.utils.sort_utils import natural_sort_key
from ocr.utils.json_utils import clean_for_json
from renderer.pdf_renderer import PDFRenderer
from utils.blob_storage import (
    build_blob_name,
    build_job_blob_prefix,
    blob_upload_path,
    blob_input_path,
    blob_output_json_path,
    blob_output_pdf_path,
    blob_assets_path,
    blob_logs_path,
    blob_job_prefix,
    delete_prefix,
    download_directory,
    get_blob_url,
    upload_directory,
    upload_file,
)
from utils.logger import get_logger, set_correlation_id, get_correlation_id
from config import settings

app = FastAPI(
    title="Document OCR Pipeline API",
    description=(
        "Upload a PDF → converts pages to images → extracts text, tables, "
        "and assets (logos, stamps, seals) → returns structured JSON + rendered PDF."
    ),
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

logger = get_logger("API")

# Storage and output directories
UPLOAD_DIR  = Path(settings.UPLOAD_DIR)
INPUT_DIR   = Path(settings.INPUT_DIR)
OUTPUT_JSON = Path(settings.OUTPUT_DIR) / "json"
OUTPUT_PDF  = Path(settings.OUTPUT_DIR) / "pdf"
ASSETS_DIR  = Path(settings.ASSETS_DIR)
LOG_DIR     = Path(settings.LOGS_DIR)

if not settings.USE_AZURE_BLOB:
    for d in [UPLOAD_DIR, INPUT_DIR, OUTPUT_JSON, OUTPUT_PDF, ASSETS_DIR, LOG_DIR]:
        d.mkdir(parents=True, exist_ok=True)
else:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

# Global state for models
_temp_model_dir: Optional[Path] = None
_layout_model_path: Optional[str] = None
_table_model_path: Optional[str] = None

@app.on_event("startup")
async def download_models_on_startup():
    """
    Download OCR models from blob storage on server startup.
    """
    global _temp_model_dir, _layout_model_path, _table_model_path
    
    if settings.USE_AZURE_BLOB:
        try:
            logger.info("Downloading models from blob storage...")
            
            _temp_model_dir = Path(tempfile.gettempdir()) / "ocr_models" / str(uuid.uuid4())[:8]
            _temp_model_dir.mkdir(parents=True, exist_ok=True)
            
            layout_temp = _temp_model_dir / "layout"
            logger.info(f"Downloading layout model to {layout_temp}")
            download_directory(settings.BLOB_LAYOUT_MODEL_DIR.rstrip('/'), str(layout_temp))
            _layout_model_path = str(layout_temp)
            
            table_temp = _temp_model_dir / "table"
            logger.info(f"Downloading table model to {table_temp}")
            download_directory(settings.BLOB_TABLE_MODEL_DIR.rstrip('/'), str(table_temp))
            _table_model_path = str(table_temp)
            
            logger.info("All models loaded successfully.")
            
        except Exception as e:
            logger.error(f"Failed to download models from blob: {e}")
            raise
    else:
        logger.info("Using local model paths.")
        _layout_model_path = settings.LAYOUT_MODEL_DIR
        _table_model_path = settings.TABLE_MODEL_DIR

_pipeline: Optional[DocumentPipeline] = None

def get_pipeline() -> DocumentPipeline:
    """
    Lazy-load the OCR pipeline singleton.
    """
    global _pipeline
    if _pipeline is None:
        layout_path = _layout_model_path or settings.LAYOUT_MODEL_DIR
        table_path = _table_model_path or settings.TABLE_MODEL_DIR
        
        logger.info(f"Initializing OCR Pipeline from: {layout_path}, {table_path}")
        _pipeline = DocumentPipeline(
            layout_model_dir=layout_path,
            table_model_dir=table_path
        )
    return _pipeline

@app.on_event("shutdown")
async def cleanup_temp_models():
    """
    Cleanup temporary model files on shutdown.
    """
    global _temp_model_dir
    if _temp_model_dir and _temp_model_dir.exists():
        try:
            logger.info(f"Removing temp models: {_temp_model_dir}")
            shutil.rmtree(_temp_model_dir)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp models: {e}")


# RESPONSE MODELS
class ProcessResponse(BaseModel):
    job_id: str
    document_id: str
    pdf_name: str
    pages: int
    json_path: str
    pdf_path: str
    assets: list[str]
    message: str
    upload_blob_url: Optional[str] = None
    json_blob_url: Optional[str] = None
    pdf_blob_url: Optional[str] = None
    assets_blob_urls: list[str] = []
    log_blob_url: Optional[str] = None


class MultiProcessResponse(BaseModel):
    results: List[ProcessResponse]
    total_processed: int
    message: str


def pdf_to_images(pdf_path: Path, output_folder: Path, dpi: int = 150) -> list[Path]:
    """Convert each PDF page to a PNG using PyMuPDF."""
    output_folder.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    image_paths = []

    for i, page in enumerate(doc, start=1):
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        img_path = output_folder / f"page_{i}.png"
        pix.save(str(img_path))
        image_paths.append(img_path)

    doc.close()
    return sorted(image_paths, key=lambda p: natural_sort_key(p.name))


def collect_assets(asset_dir: Path) -> list[Path]:
    """Return paths to all PNG assets saved in the given directory."""
    if not asset_dir.exists():
        return []
    return sorted(asset_dir.glob("*.png"))


async def _process_single_pdf(file_bytes: bytes, filename: str, dpi: int = 150) -> ProcessResponse:
    job_id   = str(uuid.uuid4())[:8]
    pdf_stem = Path(filename).stem.replace(" ", "_")
    job_name = f"{pdf_stem}_{job_id}"

    set_correlation_id(job_id)
    logger.info(f"[{job_id}] Processing: {filename}")

    if settings.USE_AZURE_BLOB:
        temp_dir = Path(tempfile.mkdtemp(prefix=f"ocr_job_{job_name}_"))
        upload_path_tmp = temp_dir / f"{job_name}.pdf"
        image_folder_tmp = temp_dir / job_name / "pages"
        json_file_tmp = temp_dir / f"{job_name}.json"
        output_pdf_file_tmp = temp_dir / f"{job_name}.pdf"
    else:
        upload_path_tmp = UPLOAD_DIR / f"{job_name}.pdf"
        image_folder_tmp = INPUT_DIR / job_name
        json_file_tmp = OUTPUT_JSON / f"{job_name}.json"
        output_pdf_file_tmp = OUTPUT_PDF / f"{job_name}.pdf"

    try:
        # save upload 
        with open(upload_path_tmp, "wb") as f_out:
            f_out.write(file_bytes)

        # convert PDF → images 
        image_paths = pdf_to_images(upload_path_tmp, image_folder_tmp, dpi=dpi)
        if not image_paths:
            raise ValueError("No pages found in PDF.")

        # run OCR pipeline 
        pipeline = get_pipeline()
        if settings.USE_AZURE_BLOB:
            asset_dir_config = {"use_blob": True, "job_name": job_name}
            job_asset_dir = None
        else:
            job_asset_dir = ASSETS_DIR / job_name
            job_asset_dir.mkdir(parents=True, exist_ok=True)
            asset_dir_config = str(job_asset_dir)
            
        document = pipeline.run([str(p) for p in image_paths], asset_dir=asset_dir_config)

        # save JSON 
        json_file_tmp.parent.mkdir(parents=True, exist_ok=True)
        with open(json_file_tmp, "w", encoding="utf-8") as jf:
            json.dump(clean_for_json(document), jf, indent=2)

        # render PDF 
        output_pdf_file_tmp.parent.mkdir(parents=True, exist_ok=True)
        renderer = PDFRenderer(json_path=str(json_file_tmp), output_pdf=str(output_pdf_file_tmp))
        renderer.run()

        # collect assets 
        assets = []
        if settings.USE_AZURE_BLOB:
            for page in document["pages"]:
                for block in page["blocks"]:
                    if "asset" in block and block["asset"].get("is_blob"):
                        assets.append(block["asset"]["path"])
        else:
            assets = [str(p) for p in collect_assets(job_asset_dir)]

        upload_blob_url = json_blob_url = pdf_blob_url = log_blob_url = None
        assets_blob_urls: list[str] = assets if settings.USE_AZURE_BLOB else []

        if settings.USE_AZURE_BLOB:
            upload_blob_url = upload_file(upload_path_tmp, blob_upload_path(upload_path_tmp.name), content_type="application/pdf")
            json_blob_url = upload_file(json_file_tmp, blob_output_json_path(json_file_tmp.name), content_type="application/json")
            pdf_blob_url = upload_file(output_pdf_file_tmp, blob_output_pdf_path(output_pdf_file_tmp.name), content_type="application/pdf")
            upload_directory(image_folder_tmp, blob_input_path(job_name))
            if hasattr(logger, "log_filename"):
                log_blob_url = get_blob_url(blob_logs_path(logger.log_filename))

        return ProcessResponse(
            job_id=job_id,
            document_id=document["document_id"],
            pdf_name=filename,
            pages=len(document["pages"]),
            json_path=str(json_file_tmp),
            pdf_path=str(output_pdf_file_tmp),
            assets=assets,
            upload_blob_url=upload_blob_url,
            json_blob_url=json_blob_url,
            pdf_blob_url=pdf_blob_url,
            assets_blob_urls=assets_blob_urls,
            log_blob_url=log_blob_url,
            message=f"Processed {len(image_paths)} pages, found {len(assets)} asset(s)."
        )

    finally:
        if settings.USE_AZURE_BLOB and 'temp_dir' in locals():
            try:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"[{job_id}] Temp cleanup failed: {e}")


# ROUTES

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "Document OCR Pipeline API"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}



# POST /process

@app.post("/process", response_model=ProcessResponse, tags=["Pipeline"])
async def process_pdf(
    file: UploadFile = File(..., description="PDF file to process"),
    dpi: int = 150
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    
    try:
        content = await file.read()
        return await _process_single_pdf(content, file.filename, dpi=dpi)
    except Exception as e:
        logger.error(f"Error processing {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-multiple", response_model=MultiProcessResponse, tags=["Pipeline"])
async def process_multiple_pdfs(
    files: List[UploadFile] = File(..., description="Multiple PDF files to process"),
    dpi: int = 150
):

    results = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            logger.warning(f"Skipping non-PDF file: {file.filename}")
            continue
        try:
            content = await file.read()
            res = await _process_single_pdf(content, file.filename, dpi=dpi)
            results.append(res)
        except Exception as e:
            logger.error(f"Error processing {file.filename}: {e}", exc_info=True)
            # We continue with other files even if one fails
    
    return MultiProcessResponse(
        results=results,
        total_processed=len(results),
        message=f"Successfully processed {len(results)} of {len(files)} files."
    )


@app.post("/process-zip", response_model=MultiProcessResponse, tags=["Pipeline"])
async def process_zip_folder(
    file: UploadFile = File(..., description="ZIP file containing PDFs or folders of images"),
    dpi: int = 150
):
    """
Upload a ZIP file containing PDFs or folders of images; PDFs are processed individually and images in a folder are processed as one document
    """
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted.")

    job_id = str(uuid.uuid4())[:8]
    temp_zip_dir = Path(tempfile.mkdtemp(prefix=f"zip_extract_{job_id}_"))
    results = []

    try:
        zip_path = temp_zip_dir / "upload.zip"
        with open(zip_path, "wb") as f:
            f.write(await file.read())
        
        extract_dir = temp_zip_dir / "extracted"
        extract_dir.mkdir()
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # 1. Look for PDF files recursively
        pdf_files = list(extract_dir.rglob("*.pdf"))
        for pdf_path in pdf_files:
            try:
                with open(pdf_path, "rb") as f:
                    content = f.read()
                res = await _process_single_pdf(content, pdf_path.name, dpi=dpi)
                results.append(res)
            except Exception as e:
                logger.error(f"Error processing PDF from ZIP {pdf_path.name}: {e}")

        # 2. checking for folders containing images (but no PDFs) and process them as single documents
        for root, dirs, files in os.walk(extract_dir):
            if not dirs: # Leaf folder
                images = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg"))]
                if images:
                    # Process this folder of images as a single document
                    folder_name = os.path.basename(root)
                    logger.info(f"Processing image folder from ZIP: {folder_name}")
                    
                   # We can either read the images into memory or pass the folder path to the processing function. 
                   # For simplicity, we'll pass the folder path.
                    try:
                        res = await _process_image_folder(Path(root), folder_name, dpi=dpi)
                        results.append(res)
                    except Exception as e:
                        logger.error(f"Error processing image folder {folder_name}: {e}")

    finally:
        shutil.rmtree(temp_zip_dir)

    return MultiProcessResponse(
        results=results,
        total_processed=len(results),
        message=f"ZIP processed. Found and processed {len(results)} documents."
    )


async def _process_image_folder(folder_path: Path, folder_name: str, dpi: int = 150) -> ProcessResponse:
    job_id = str(uuid.uuid4())[:8]
    job_name = f"{folder_name}_{job_id}"
    set_correlation_id(job_id)

    if settings.USE_AZURE_BLOB:
        temp_dir = Path(tempfile.mkdtemp(prefix=f"ocr_job_{job_name}_"))
        image_folder_tmp = temp_dir / "pages"
        shutil.copytree(folder_path, image_folder_tmp)
        json_file_tmp = temp_dir / f"{job_name}.json"
        output_pdf_file_tmp = temp_dir / f"{job_name}.pdf"
    else:
        image_folder_tmp = folder_path
        json_file_tmp = OUTPUT_JSON / f"{job_name}.json"
        output_pdf_file_tmp = OUTPUT_PDF / f"{job_name}.pdf"

    image_paths = sorted([
        str(p) for p in image_folder_tmp.glob("*") 
        if p.suffix.lower() in [".png", ".jpg", ".jpeg"]
    ], key=natural_sort_key)

    pipeline = get_pipeline()
    asset_dir_config = {"use_blob": True, "job_name": job_name} if settings.USE_AZURE_BLOB else str(ASSETS_DIR / job_name)
    if not settings.USE_AZURE_BLOB:
        Path(asset_dir_config).mkdir(parents=True, exist_ok=True)

    document = pipeline.run(image_paths, asset_dir=asset_dir_config)

    with open(json_file_tmp, "w", encoding="utf-8") as jf:
        json.dump(clean_for_json(document), jf, indent=2)

    renderer = PDFRenderer(json_path=str(json_file_tmp), output_pdf=str(output_pdf_file_tmp))
    renderer.run()

    upload_blob_url = json_blob_url = pdf_blob_url = log_blob_url = None
    if settings.USE_AZURE_BLOB:
        json_blob_url = upload_file(json_file_tmp, blob_output_json_path(json_file_tmp.name), content_type="application/json")
        pdf_blob_url = upload_file(output_pdf_file_tmp, blob_output_pdf_path(output_pdf_file_tmp.name), content_type="application/pdf")
        upload_directory(image_folder_tmp, blob_input_path(job_name))
        if hasattr(logger, "log_filename"):
            log_blob_url = get_blob_url(blob_logs_path(logger.log_filename))

    return ProcessResponse(
        job_id=job_id,
        document_id=document["document_id"],
        pdf_name=folder_name,
        pages=len(document["pages"]),
        json_path=str(json_file_tmp),
        pdf_path=str(output_pdf_file_tmp),
        assets=[], 
        json_blob_url=json_blob_url,
        pdf_blob_url=pdf_blob_url,
        log_blob_url=log_blob_url,
        message=f"Processed image folder {folder_name}"
    )




# POST /render-pdf
@app.post("/render-pdf", tags=["Pipeline"])
async def render_pdf_from_json(
    file: UploadFile = File(..., description="JSON output from /process")
):
    """Re-render a PDF from a previously generated JSON and skiping OCR."""
    if not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON files are accepted.")

    job_id    = str(uuid.uuid4())[:8]
    json_stem = Path(file.filename).stem
    json_path = OUTPUT_JSON / f"{json_stem}_{job_id}.json"

    with open(json_path, "wb") as jf:
        jf.write(await file.read())

    output_pdf_path = OUTPUT_PDF / f"{json_stem}_{job_id}.pdf"

    try:
        renderer = PDFRenderer(
            json_path=str(json_path),
            output_pdf=str(output_pdf_path)
        )
        renderer.run()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {e}")

    return {
        "job_id": job_id,
        "pdf_path": str(output_pdf_path),
        "message": "PDF rendered successfully."
    }



# GET /download/json/{filename}

@app.get("/download/json/{filename}", tags=["Downloads"])
def download_json(filename: str):
    """Download a generated JSON file by filename."""
    if settings.USE_AZURE_BLOB:
        return RedirectResponse(url=get_blob_url(blob_output_json_path(filename)))

    path = OUTPUT_JSON / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"JSON file not found: {filename}")
    return FileResponse(str(path), media_type="application/json", filename=filename)



# GET /download/pdf/{filename}

@app.get("/download/pdf/{filename}", tags=["Downloads"])
def download_pdf(filename: str):
    """Download a rendered PDF file by filename."""
    if settings.USE_AZURE_BLOB:
        return RedirectResponse(url=get_blob_url(blob_output_pdf_path(filename)))

    path = OUTPUT_PDF / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"PDF file not found: {filename}")
    return FileResponse(str(path), media_type="application/pdf", filename=filename)



# GET /download/asset/{job_name}/{filename}

@app.get("/download/asset/{job_name}/{filename}", tags=["Downloads"])
def download_asset(job_name: str, filename: str):
    """Download a specific extracted asset (logo, stamp, seal, image crop)."""
    if settings.USE_AZURE_BLOB:
        return RedirectResponse(url=get_blob_url(blob_assets_path(job_name, filename)))

    path = ASSETS_DIR / job_name / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Asset not found: {filename}")
    return FileResponse(str(path), media_type="image/png", filename=filename)



# GET /assets/{job_name}

@app.get("/assets/{job_name}", tags=["Assets"])
def list_assets(job_name: str):
    """List all extracted assets (logos, seals, stamps) for a given job."""
    asset_folder = ASSETS_DIR / job_name
    if not asset_folder.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for job: {job_name}")

    files = sorted(asset_folder.glob("*.png"))
    return {
        "job_name": job_name,
        "count": len(files),
        "assets": [
            {
                "filename": f.name,
                "download_url": f"/download/asset/{job_name}/{f.name}",
                "size_bytes": f.stat().st_size
            }
            for f in files
        ]
    }



# GET /jobs

@app.get("/jobs", tags=["Jobs"])
def list_jobs():
    """List all processed jobs (based on output JSON files)."""
    if settings.USE_AZURE_BLOB:
       # In blob-first mode, we don't have a local directory of JSON files to list jobs from.
        return {"total": 0, "jobs": [], "message": "Jobs not persisted in blob-first mode. Use job_id from /process response."}
    
    jobs = []
    if OUTPUT_JSON.exists():
        for jf in sorted(OUTPUT_JSON.glob("*.json")):
            pdf_match    = OUTPUT_PDF / f"{jf.stem}.pdf"
            asset_folder = ASSETS_DIR / jf.stem
            asset_count  = len(list(asset_folder.glob("*.png"))) if asset_folder.exists() else 0

            jobs.append({
                "job_name":        jf.stem,
                "json_file":       jf.name,
                "pdf_file":        pdf_match.name if pdf_match.exists() else None,
                "asset_count":     asset_count,
                "json_size_bytes": jf.stat().st_size,
            })

    return {"total": len(jobs), "jobs": jobs}



# GET /jobs/{job_name}

@app.get("/jobs/{job_name}", tags=["Jobs"])
def get_job(job_name: str):
    """Get details and document structure for a specific job."""
    document = None
    
    if settings.USE_AZURE_BLOB:
# In blob-first mode, we need to download the JSON from blob storage to read the document structure.
        try:
            temp_json_path = Path(tempfile.gettempdir()) / f"{job_name}_temp.json"
            blob_name = blob_output_json_path(f"{job_name}.json")
            from utils.blob_storage import get_container_client
            container_client = get_container_client()
            blob_client = container_client.get_blob_client(blob_name)
            
            with open(temp_json_path, "wb") as f:
                f.write(blob_client.download_blob().readall())
            
            with open(temp_json_path, "r", encoding="utf-8") as jf:
                document = json.load(jf)
            
            # Clean up temp file
            temp_json_path.unlink()
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Job not found in blob storage: {job_name}")
    else:
        # Local mode: read from local file
        json_path = OUTPUT_JSON / f"{job_name}.json"
        if not json_path.exists():
            raise HTTPException(status_code=404, detail=f"Job not found: {job_name}")

        with open(json_path, "r", encoding="utf-8") as jf:
            document = json.load(jf)

    asset_folder = ASSETS_DIR / job_name
    local_assets = [
        {
            "filename":     p.name,
            "download_url": f"/download/asset/{job_name}/{p.name}"
        }
        for p in sorted(asset_folder.glob("*.png"))
    ] if asset_folder.exists() else []

    assets = local_assets
    json_blob_url = None
    pdf_blob_url = None

    if settings.USE_AZURE_BLOB:
        json_blob_url = get_blob_url(blob_output_json_path(f"{job_name}.json"))
        pdf_blob_url = get_blob_url(blob_output_pdf_path(f"{job_name}.pdf"))
        # In blob-first mode, we assume assets are also in blob storage and construct their URLs

    return {
        "job_name":      job_name,
        "document_id":   document.get("document_id") if document else None,
        "pages":         len(document.get("pages", [])) if document else 0,
        "assets":        assets,
        "download_json": f"/download/json/{job_name}.json",
        "download_pdf":  f"/download/pdf/{job_name}.pdf",
        "json_blob_url": json_blob_url,
        "pdf_blob_url":  pdf_blob_url
    }



# DELETE /jobs/{job_name}

@app.delete("/jobs/{job_name}", tags=["Jobs"])
def delete_job(job_name: str):
    """Delete all files associated with a job (JSON, PDF, page images, assets)."""
    removed = []

    for target in [
        OUTPUT_JSON / f"{job_name}.json",
        OUTPUT_PDF  / f"{job_name}.pdf",
        INPUT_DIR   / job_name,
        ASSETS_DIR  / job_name,
        UPLOAD_DIR  / f"{job_name}.pdf",
    ]:
        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            removed.append(str(target))

    if settings.USE_AZURE_BLOB:
        # Delete blobs across the proper folder structure
        deleted_blobs = []
        for prefix in [
            blob_input_path(job_name),       
            blob_assets_path(job_name),      
        ]:
            deleted_blobs.extend(delete_prefix(prefix))
        # Delete individual files by exact blob name
        try:
            from utils.blob_storage import get_container_client
            container_client = get_container_client()
            for blob_name in [
                blob_upload_path(f"{job_name}.pdf"),
                blob_output_json_path(f"{job_name}.json"),
                blob_output_pdf_path(f"{job_name}.pdf"),
            ]:
                try:
                    container_client.delete_blob(blob_name)
                    deleted_blobs.append(blob_name)
                except Exception:
                    pass 
        except Exception:
            pass
        removed.extend([f"azure://{settings.AZURE_BLOB_CONTAINER_NAME}/{blob_name}" for blob_name in deleted_blobs])

    if not removed:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_name}")

    return {"job_name": job_name, "deleted": removed}