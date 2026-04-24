import os
import json
import uuid
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List

import fitz  
from ocr.pipeline import DocumentPipeline
from ocr.utils.sort_utils import natural_sort_key
from ocr.utils.json_utils import clean_for_json
from renderer.pdf_renderer import PDFRenderer
from utils.blob_storage import (
    blob_upload_path,
    blob_input_path,
    blob_output_json_path,
    blob_output_pdf_path,
    blob_logs_path,
    get_blob_url,
    upload_directory,
    upload_file,
    download_directory,
)
from utils.logger import get_logger, set_correlation_id
from config import settings

logger = get_logger("OCR_Processor")

# MODEL PATHS (temp or local)
_temp_model_dir: Optional[Path] = None
_layout_model_path: Optional[str] = None
_table_model_path: Optional[str] = None
_pipeline: Optional[DocumentPipeline] = None

async def initialize_ocr():
    """Initialize models and pipeline."""
    global _temp_model_dir, _layout_model_path, _table_model_path, _pipeline
    
    if _pipeline is not None:
        return

    if settings.USE_AZURE_BLOB:
        try:
            logger.info("Initializing OCR: Downloading models from blob storage...")
            _temp_model_dir = Path(tempfile.gettempdir()) / "ocr_models" / str(uuid.uuid4())[:8]
            _temp_model_dir.mkdir(parents=True, exist_ok=True)
            
            layout_temp = _temp_model_dir / "layout"
            download_directory(settings.BLOB_LAYOUT_MODEL_DIR.rstrip('/'), str(layout_temp))
            _layout_model_path = str(layout_temp)
            
            table_temp = _temp_model_dir / "table"
            download_directory(settings.BLOB_TABLE_MODEL_DIR.rstrip('/'), str(table_temp))
            _table_model_path = str(table_temp)
            
            logger.info(f"Models loaded to temp directory: {_temp_model_dir}")
        except Exception as e:
            logger.error(f"Failed to download models: {e}")
            raise
    else:
        _layout_model_path = settings.LAYOUT_MODEL_DIR
        _table_model_path = settings.TABLE_MODEL_DIR

    _pipeline = DocumentPipeline(
        layout_model_dir=_layout_model_path or settings.LAYOUT_MODEL_DIR,
        table_model_dir=_table_model_path or settings.TABLE_MODEL_DIR
    )
    logger.info("OCR Pipeline initialized.")

def pdf_to_images(pdf_path: Path, output_folder: Path, dpi: int = 150) -> List[Path]:
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

async def process_pdf_bytes(pdf_bytes: bytes, filename: str, dpi: int = 150) -> Dict[str, Any]:
    """
    Processes PDF bytes through the OCR pipeline and returns the searchable PDF bytes 
    along with other metadata.
    """
    await initialize_ocr()
    
    job_id = str(uuid.uuid4())[:8]
    pdf_stem = Path(filename).stem.replace(" ", "_")
    job_name = f"{pdf_stem}_{job_id}"
    set_correlation_id(job_id)

    # Use a single temp directory for all processing
    with tempfile.TemporaryDirectory(prefix=f"ocr_job_{job_name}_") as td:
        temp_dir = Path(td)
        upload_path = temp_dir / f"{job_name}.pdf"
        image_folder = temp_dir / "pages"
        json_file = temp_dir / f"{job_name}.json"
        output_pdf_file = temp_dir / f"ocr_{job_name}.pdf"

        # Save input PDF
        with open(upload_path, "wb") as f:
            f.write(pdf_bytes)

        # Convert to images
        image_paths = pdf_to_images(upload_path, image_folder, dpi=dpi)
        
        # Run pipeline
        asset_dir_config = {"use_blob": True, "job_name": job_name} if settings.USE_AZURE_BLOB else str(temp_dir / "assets")
        if not settings.USE_AZURE_BLOB:
            Path(asset_dir_config).mkdir(parents=True, exist_ok=True)

        document = _pipeline.run([str(p) for p in image_paths], asset_dir=asset_dir_config)

        # Save JSON
        with open(json_file, "w", encoding="utf-8") as jf:
            json.dump(clean_for_json(document), jf, indent=2)

        # Render searchable PDF
        renderer = PDFRenderer(json_path=str(json_file), output_pdf=str(output_pdf_file))
        renderer.run()

        # Read back the processed PDF
        with open(output_pdf_file, "rb") as f:
            processed_pdf_bytes = f.read()

        # If using blob, we might want to upload assets/JSON here too as per user requirement
        if settings.USE_AZURE_BLOB:
            # Optional: Upload images to blob for viewing
            upload_directory(image_folder, blob_input_path(job_name))
            # Optional: Upload JSON to blob
            upload_file(json_file, blob_output_json_path(f"{job_name}.json"), content_type="application/json")

        return {
            "processed_pdf_bytes": processed_pdf_bytes,
            "job_id": job_id,
            "document_id": document["document_id"],
            "pages": len(document["pages"])
        }
