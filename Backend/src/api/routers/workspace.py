from __future__ import annotations

import asyncio
import os
import tempfile
import zipfile
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
import requests
import json

from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from src.shared.types import success_response
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

# OCR Service Configuration
OCR_SERVICE_URL = (os.getenv("OCR_SERVICE_URL") or "http://localhost:8001").strip()


# ---- Azure blob config (demo) -------------------------------------------------

AZURE_BLOB_CONTAINER_NAME = (os.getenv("AZURE_BLOB_CONTAINER_NAME") or "").strip()
AZURE_BLOB_FOLDER_NAME = (os.getenv("AZURE_BLOB_FOLDER_NAME") or "").strip(" /")
AZURE_STORAGE_CONNECTION_STRING = (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
AZURE_STORAGE_ACCOUNT_NAME = (os.getenv("AZURE_STORAGE_ACCOUNT_NAME") or "").strip()
AZURE_STORAGE_ACCOUNT_KEY = (os.getenv("AZURE_STORAGE_ACCOUNT_KEY") or "").strip()


def _normalize_blob_path(path: str) -> str:
    cleaned = (path or "").replace("\\", "/").strip().strip("/")
    if ".." in cleaned.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path segment.")
    return cleaned


def _blob_service_client() -> BlobServiceClient:
    if AZURE_STORAGE_CONNECTION_STRING:
        return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    if AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY:
        account_url = f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=AZURE_STORAGE_ACCOUNT_KEY)
    raise HTTPException(status_code=500, detail="Azure storage is not configured.")


def _container_client():
    if not AZURE_BLOB_CONTAINER_NAME:
        raise HTTPException(status_code=500, detail="AZURE_BLOB_CONTAINER_NAME is missing.")
    return _blob_service_client().get_container_client(AZURE_BLOB_CONTAINER_NAME)


def _get_local_upload_dir() -> Path:
    """Get the local upload directory, creating it if necessary."""
    upload_dir = Path(__file__).parent.parent.parent / "temp_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


async def _upload_bytes_batched(items: list[tuple[str, bytes]], batch_size: int = 12) -> None:
    """Upload files to blob storage or local storage (if blob storage not configured)."""
    if not items:
        return
    
    # If blob storage is configured, use it
    if AZURE_BLOB_CONTAINER_NAME:
        container = _container_client()
        semaphore = asyncio.Semaphore(batch_size)

        async def one(blob_path: str, payload: bytes) -> None:
            async with semaphore:
                await asyncio.to_thread(
                    container.get_blob_client(blob=blob_path).upload_blob,
                    payload,
                    overwrite=True,
                )

        await asyncio.gather(*(one(path, data) for path, data in items))
    else:
        # Fall back to local storage
        upload_dir = _get_local_upload_dir()
        
        async def save_locally(blob_path: str, payload: bytes) -> None:
            file_path = upload_dir / blob_path.replace("/", os.sep)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(file_path.write_bytes, payload)
        
        semaphore = asyncio.Semaphore(batch_size)
        
        async def one_local(blob_path: str, payload: bytes) -> None:
            async with semaphore:
                await save_locally(blob_path, payload)
        
        await asyncio.gather(*(one_local(path, data) for path, data in items))


def _content_disposition_inline(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii").replace('"', "'")
    utf8_filename = quote(filename, safe="")
    return f"inline; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_filename}"


def _sas_url_for_blob(blob_path: str, expiry_minutes: int = 20) -> str:
    safe_blob_path = _normalize_blob_path(blob_path)
    if not safe_blob_path:
        raise HTTPException(status_code=400, detail="Missing blob path.")
    if not AZURE_STORAGE_ACCOUNT_NAME or not AZURE_STORAGE_ACCOUNT_KEY:
        raise HTTPException(status_code=500, detail="SAS credentials are not configured.")
    token = generate_blob_sas(
        account_name=AZURE_STORAGE_ACCOUNT_NAME,
        container_name=AZURE_BLOB_CONTAINER_NAME,
        blob_name=safe_blob_path,
        account_key=AZURE_STORAGE_ACCOUNT_KEY,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
    )
    return f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_BLOB_CONTAINER_NAME}/{safe_blob_path}?{token}"


def _build_tree(paths: list[str]) -> list[dict[str, Any]]:
    root: dict[str, Any] = {}
    storage_prefix = f"{AZURE_BLOB_FOLDER_NAME}/" if AZURE_BLOB_FOLDER_NAME else ""
    for full_path in sorted(set(paths)):
        full_blob_path = _normalize_blob_path(full_path)
        if not full_blob_path:
            continue
        display_path = full_blob_path
        if storage_prefix and full_blob_path.startswith(storage_prefix):
            display_path = full_blob_path[len(storage_prefix) :]
        display_path = _normalize_blob_path(display_path)
        if not display_path:
            continue

        parts = [p for p in display_path.split("/") if p]
        current = root
        for idx, part in enumerate(parts):
            is_file = idx == len(parts) - 1
            node = current.get(part)
            if node is None:
                joined = "/".join(parts[: idx + 1])
                ext = ""
                if is_file and "." in part:
                    ext = part.rsplit(".", 1)[1].lower()
                node = {
                    "name": part,
                    "path": joined,
                    "type": "file" if is_file else "folder",
                    "extension": ext,
                    "blobPath": full_blob_path if is_file else "",
                    "children": {},
                }
                current[part] = node
            current = node["children"]

    def to_list(nodes: dict[str, Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for _, node in sorted(nodes.items(), key=lambda item: (item[1]["type"] != "folder", item[0].lower())):
            children = to_list(node["children"]) if node["type"] == "folder" else []
            out.append(
                {
                    "name": node["name"],
                    "path": node["path"],
                    "type": node["type"],
                    "extension": node["extension"],
                    "blobPath": node["blobPath"],
                    "children": children,
                }
            )
        return out

    return to_list(root)


# ---- Workspace endpoints used by frontend -------------------------------------


@router.post("/upload/folder")
async def upload_folder(files: list[UploadFile] = File(...)) -> JSONResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    upload_items: list[tuple[str, bytes]] = []
    for file in files:
        relative_path = _normalize_blob_path(file.filename or "")
        if not relative_path:
            continue
        payload = await file.read()
        if not payload:
            continue
        blob_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{relative_path}") if AZURE_BLOB_FOLDER_NAME else relative_path
        upload_items.append((blob_path, payload))

    await _upload_bytes_batched(upload_items)
    uploaded_paths = [path for path, _ in upload_items]
    return JSONResponse(content={"tree": _build_tree(uploaded_paths), "uploadedCount": len(uploaded_paths)})


@router.post("/upload/zip")
async def upload_zip(zip_file: UploadFile = File(...)) -> JSONResponse:
    name = (zip_file.filename or "").strip()
    if not name.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed.")

    zip_bytes = await zip_file.read()
    if not zip_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    zip_base = Path(name).stem
    upload_items: list[tuple[str, bytes]] = []
    with tempfile.TemporaryDirectory() as td:
        zip_path = Path(td) / "incoming.zip"
        zip_path.write_bytes(zip_bytes)
        extract_root = Path(td) / "extracted"
        extract_root.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(str(zip_path), "r") as archive:
            archive.extractall(str(extract_root))

        entries = [p for p in extract_root.iterdir() if p.name not in {"__MACOSX", ".DS_Store"}]
        actual_root = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_root

        for path in actual_root.rglob("*"):
            if not path.is_file():
                continue
            rel = _normalize_blob_path(str(path.relative_to(actual_root)))
            blob_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}/{rel}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(f"{zip_base}/{rel}")
            upload_items.append((blob_path, path.read_bytes()))

    await _upload_bytes_batched(upload_items)
    uploaded_paths = [path for path, _ in upload_items]
    root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
    return JSONResponse(content={"tree": _build_tree(uploaded_paths), "uploadedCount": len(uploaded_paths), "rootPath": root_path})


@router.post("/upload/process-with-ocr")
async def upload_process_with_ocr(files: list[UploadFile] = File(...)) -> JSONResponse:
    """
    Upload files (folders, individual files, or ZIPs) and perform OCR on PDFs.
    - Accepts multiple files from folder upload
    - Accepts individual files
    - Accepts ZIP archives
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    upload_items: list[tuple[str, bytes]] = []
    pdf_files: list[tuple[str, bytes]] = []
    
    try:
        # Separate PDFs from other files and collect all for upload
        for file in files:
            filename = file.filename or "unknown"
            payload = await file.read()
            
            if not payload:
                logger.warning(f"Skipping empty file: {filename}")
                continue
            
            # Normalize the path
            rel_path = _normalize_blob_path(filename)
            if not rel_path:
                continue
                
            blob_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{rel_path}") if AZURE_BLOB_FOLDER_NAME else rel_path
            upload_items.append((blob_path, payload))
            
            # Track PDFs for OCR processing
            if filename.lower().endswith('.pdf'):
                pdf_files.append((filename, payload))
        
        if not upload_items:
            raise HTTPException(status_code=400, detail="No valid files found in upload.")
        
        # Upload all files to blob storage
        await _upload_bytes_batched(upload_items)
        logger.info(f"Uploaded {len(upload_items)} files")
        
        # If we have PDFs, process them with OCR
        ocr_processed = False
        ocr_message = "No PDFs found for OCR processing"
        ocr_warning = None
        
        if pdf_files:
            logger.info(f"Found {len(pdf_files)} PDFs, initiating OCR processing")
            
            try:
                # Create a temporary ZIP with just the PDFs
                with tempfile.TemporaryDirectory() as td:
                    ocr_zip_path = Path(td) / "ocr_input.zip"
                    with zipfile.ZipFile(str(ocr_zip_path), "w") as ocr_zip:
                        for pdf_name, pdf_bytes in pdf_files:
                            ocr_zip.writestr(pdf_name, pdf_bytes)
                    
                    # Call the OCR service
                    with open(ocr_zip_path, "rb") as f:
                        files_to_send = {"file": ("ocr_input.zip", f, "application/zip")}
                        ocr_response = requests.post(
                            f"{OCR_SERVICE_URL}/process-zip",
                            files=files_to_send,
                            timeout=3600
                        )
                    
                    if ocr_response.status_code == 200:
                        ocr_result = ocr_response.json()
                        ocr_processed = True
                        ocr_message = ocr_result.get("message", "OCR processing completed successfully")
                        logger.info(f"OCR processing completed: {ocr_message}")
                    else:
                        logger.error(f"OCR service error: {ocr_response.status_code}")
                        logger.error(f"Response: {ocr_response.text}")
                        ocr_warning = f"OCR service returned error {ocr_response.status_code}"
            
            except requests.exceptions.ConnectionError:
                logger.warning(f"Could not connect to OCR service at {OCR_SERVICE_URL}")
                ocr_warning = f"OCR service unavailable at {OCR_SERVICE_URL}"
            
            except Exception as e:
                logger.error(f"OCR processing error: {e}", exc_info=True)
                ocr_warning = str(e)
        
        # Build response
        uploaded_paths = [path for path, _ in upload_items]
        response_data = {
            "tree": _build_tree(uploaded_paths),
            "uploadedCount": len(uploaded_paths),
            "ocrProcessed": ocr_processed,
            "ocrMessage": ocr_message,
            "totalPdfs": len(pdf_files)
        }
        
        if ocr_warning:
            response_data["ocrWarning"] = ocr_warning
        
        return JSONResponse(content=response_data)
    
    except Exception as e:
        logger.error(f"Error in upload_process_with_ocr: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing upload: {str(e)}")


@router.post("/upload/zip-with-ocr")
async def upload_zip_with_ocr(zip_file: UploadFile = File(...)) -> JSONResponse:
    """
    Upload a ZIP file containing PDFs and perform OCR processing on them.
    Uploads the original files and OCR results to blob storage.
    """
    name = (zip_file.filename or "").strip()
    if not name.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed.")

    zip_bytes = await zip_file.read()
    if not zip_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    zip_base = Path(name).stem
    upload_items: list[tuple[str, bytes]] = []
    
    try:
        # Extract ZIP temporarily
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "incoming.zip"
            zip_path.write_bytes(zip_bytes)
            extract_root = Path(td) / "extracted"
            extract_root.mkdir(parents=True, exist_ok=True)
            
            with zipfile.ZipFile(str(zip_path), "r") as archive:
                archive.extractall(str(extract_root))

            entries = [p for p in extract_root.iterdir() if p.name not in {"__MACOSX", ".DS_Store"}]
            actual_root = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_root

            # First, upload all original files to blob storage
            for path in actual_root.rglob("*"):
                if not path.is_file():
                    continue
                rel = _normalize_blob_path(str(path.relative_to(actual_root)))
                blob_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}/{rel}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(f"{zip_base}/{rel}")
                upload_items.append((blob_path, path.read_bytes()))

            await _upload_bytes_batched(upload_items)
            
            # Now perform OCR on PDFs by calling the OCR service
            logger.info(f"Starting OCR processing for {zip_base}")
            
            # Find all PDFs in the extracted folder
            pdf_files = list(actual_root.rglob("*.pdf"))
            
            if pdf_files:
                # Create a temporary zip with just the PDFs to send to OCR service
                ocr_zip_path = Path(td) / "ocr_input.zip"
                with zipfile.ZipFile(str(ocr_zip_path), "w") as ocr_zip:
                    for pdf_file in pdf_files:
                        arcname = str(pdf_file.relative_to(actual_root))
                        ocr_zip.write(str(pdf_file), arcname=arcname)
                
                # Call the OCR service
                try:
                    with open(ocr_zip_path, "rb") as f:
                        files_to_send = {"file": ("ocr_input.zip", f, "application/zip")}
                        ocr_response = requests.post(
                            f"{OCR_SERVICE_URL}/process-zip",
                            files=files_to_send,
                            timeout=3600  # 1 hour timeout for OCR processing
                        )
                    
                    if ocr_response.status_code == 200:
                        ocr_result = ocr_response.json()
                        logger.info(f"OCR processing completed: {ocr_result}")
                        
                        # If OCR service stores results in blob, we just return success
                        # The results will be available via the blob tree
                        uploaded_paths = [path for path, _ in upload_items]
                        root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
                        
                        return JSONResponse(content={
                            "tree": _build_tree(uploaded_paths),
                            "uploadedCount": len(uploaded_paths),
                            "rootPath": root_path,
                            "ocrProcessed": True,
                            "ocrMessage": ocr_result.get("message", "OCR processing completed")
                        })
                    else:
                        logger.error(f"OCR service returned error: {ocr_response.status_code}")
                        logger.error(f"OCR service response: {ocr_response.text}")
                        # Return uploaded files even if OCR failed
                        uploaded_paths = [path for path, _ in upload_items]
                        root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
                        
                        return JSONResponse(content={
                            "tree": _build_tree(uploaded_paths),
                            "uploadedCount": len(uploaded_paths),
                            "rootPath": root_path,
                            "ocrProcessed": False,
                            "ocrError": f"OCR service error: {ocr_response.status_code}"
                        })
                
                except requests.exceptions.ConnectionError:
                    logger.warning(f"Could not connect to OCR service at {OCR_SERVICE_URL}. Returning uploaded files only.")
                    uploaded_paths = [path for path, _ in upload_items]
                    root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
                    
                    return JSONResponse(content={
                        "tree": _build_tree(uploaded_paths),
                        "uploadedCount": len(uploaded_paths),
                        "rootPath": root_path,
                        "ocrProcessed": False,
                        "ocrWarning": f"OCR service not available at {OCR_SERVICE_URL}"
                    })
                except Exception as e:
                    logger.error(f"Error calling OCR service: {e}")
                    uploaded_paths = [path for path, _ in upload_items]
                    root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
                    
                    return JSONResponse(content={
                        "tree": _build_tree(uploaded_paths),
                        "uploadedCount": len(uploaded_paths),
                        "rootPath": root_path,
                        "ocrProcessed": False,
                        "ocrError": str(e)
                    })
            else:
                logger.info(f"No PDFs found in {zip_base}")
                uploaded_paths = [path for path, _ in upload_items]
                root_path = _normalize_blob_path(f"{AZURE_BLOB_FOLDER_NAME}/{zip_base}") if AZURE_BLOB_FOLDER_NAME else _normalize_blob_path(zip_base)
                
                return JSONResponse(content={
                    "tree": _build_tree(uploaded_paths),
                    "uploadedCount": len(uploaded_paths),
                    "rootPath": root_path,
                    "ocrProcessed": False,
                    "ocrInfo": "No PDF files found in the uploaded ZIP"
                })
    
    except Exception as e:
        logger.error(f"Error in upload_zip_with_ocr: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing upload: {str(e)}")


@router.get("/tree")
def get_tree(prefix: str = Query(default="", description="Optional blob prefix")) -> JSONResponse:
    if AZURE_BLOB_CONTAINER_NAME:
        # Blob storage mode
        container = _container_client()
        base_prefix = _normalize_blob_path(prefix or AZURE_BLOB_FOLDER_NAME)
        if not base_prefix:
            raise HTTPException(status_code=400, detail="Invalid prefix.")

        blob_paths = [blob.name for blob in container.list_blobs(name_starts_with=f"{base_prefix}/")]
        return JSONResponse(content={"tree": _build_tree(blob_paths), "count": len(blob_paths), "prefix": base_prefix})
    else:
        # Local storage mode
        upload_dir = _get_local_upload_dir()
        blob_paths = []
        if upload_dir.exists():
            for file_path in upload_dir.rglob("*"):
                if file_path.is_file():
                    rel_path = file_path.relative_to(upload_dir)
                    blob_paths.append(_normalize_blob_path(str(rel_path)))
        return JSONResponse(content={"tree": _build_tree(blob_paths), "count": len(blob_paths), "prefix": "uploads"})


@router.get("/file")
async def get_file(path: str = Query(..., description="Azure blob path")) -> StreamingResponse:
    blob_path = _normalize_blob_path(path)
    if not blob_path:
        raise HTTPException(status_code=400, detail="Missing file path.")
    
    if AZURE_BLOB_CONTAINER_NAME:
        # Blob storage mode
        if AZURE_BLOB_FOLDER_NAME and not blob_path.startswith(f"{AZURE_BLOB_FOLDER_NAME}/"):
            raise HTTPException(status_code=400, detail="Path must be under configured root folder.")

        container = _container_client()
        blob_client = container.get_blob_client(blob=blob_path)
        try:
            downloader = await asyncio.to_thread(blob_client.download_blob)
            payload = await asyncio.to_thread(downloader.readall)
            props = await asyncio.to_thread(blob_client.get_blob_properties)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="Blob not found.") from exc

        content_type = (
            (props.content_settings.content_type if props and props.content_settings else None)
            or "application/octet-stream"
        )
    else:
        # Local storage mode
        upload_dir = _get_local_upload_dir()
        file_path = upload_dir / blob_path.replace("/", os.sep)
        
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found.")
        
        try:
            payload = await asyncio.to_thread(file_path.read_bytes)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="File not found.") from exc
        
        # Guess content type based on extension
        import mimetypes
        content_type, _ = mimetypes.guess_type(str(file_path))
        content_type = content_type or "application/octet-stream"

    filename = Path(blob_path).name
    headers = {
        "Content-Disposition": _content_disposition_inline(filename),
        "Cache-Control": "no-store",
    }
    return StreamingResponse(iter([payload]), media_type=content_type, headers=headers)


@router.get("/file-url")
def get_file_url(path: str = Query(..., description="Azure blob path")) -> JSONResponse:
    blob_path = _normalize_blob_path(path)
    if not blob_path:
        raise HTTPException(status_code=400, detail="Missing file path.")
    
    if AZURE_BLOB_CONTAINER_NAME:
        # Blob storage mode
        if AZURE_BLOB_FOLDER_NAME and not blob_path.startswith(f"{AZURE_BLOB_FOLDER_NAME}/"):
            raise HTTPException(status_code=400, detail="Path must be under configured root folder.")
        return JSONResponse(content={"url": _sas_url_for_blob(blob_path)})
    else:
        # Local storage mode - return a file endpoint URL
        return JSONResponse(content={"url": f"/file?path={quote(blob_path)}"})


@router.delete("/clear")
def clear_workspace() -> JSONResponse:
    if AZURE_BLOB_CONTAINER_NAME:
        # Blob storage mode
        container = _container_client()
        base_prefix = _normalize_blob_path(AZURE_BLOB_FOLDER_NAME)
        if not base_prefix:
            raise HTTPException(status_code=400, detail="Invalid prefix.")
        blob_paths = [blob.name for blob in container.list_blobs(name_starts_with=f"{base_prefix}/")]
        for blob_path in blob_paths:
            with suppress(Exception):
                container.delete_blob(blob_path)
        return JSONResponse(content={"deleted": len(blob_paths), "message": "Workspace cleared successfully"})
    else:
        # Local storage mode - delete local files
        upload_dir = _get_local_upload_dir()
        deleted_count = 0
        if upload_dir.exists():
            import shutil
            for item in upload_dir.iterdir():
                try:
                    if item.is_dir():
                        shutil.rmtree(item)
                    else:
                        item.unlink()
                    deleted_count += 1
                except Exception:
                    pass
        return JSONResponse(content={"deleted": deleted_count, "message": "Workspace cleared successfully"})


# ---- Compatibility endpoints for existing frontend flows ----------------------


async def _run_classification_for_uploads(files: list[UploadFile]) -> Any:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    # Lazy import to avoid model/LLM initialization at app import time.
    from src.modules.classification.infrastructure.services.classification_pipeline import classification_pipeline

    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
        return await classification_pipeline.run(saved_paths)
    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


@router.post("/api/v1/classify/")
async def classify_v1(files: list[UploadFile] = File(...)) -> Any:
    return await _run_classification_for_uploads(files)


@router.post("/api/v1/classify/classify-other-files")
async def classify_other_files_v1(files: list[UploadFile] = File(...)) -> Any:
    """Compatibility alias for classify-other-files endpoint."""
    return await classify_other_files(files)


@router.post("/api/v1/summarize/")
async def summarize_v1(
    files: list[UploadFile] = File(...),
    task_type: str = Form("application_document_summarization"),
) -> Any:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    from src.modules.summarisation.infrastructure.services.summarization_pipeline import summarization_pipeline

    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
        return await summarization_pipeline.run(saved_paths, task_type)
    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


@router.post("/api/v1/sae_summarize/")
async def summarize_sae_v1(files: list[UploadFile] = File(...)) -> Any:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    from src.modules.summarisation.infrastructure.services.sae_pipeline import sae_pipeline

    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
        return await sae_pipeline.run(saved_paths)
    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


@router.post("/api/v1/meeting_summarize/")
async def summarize_meeting_v1(files: list[UploadFile] = File(...)) -> Any:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    from src.modules.summarisation.infrastructure.services.meeting_pipeline import meeting_pipeline

    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
        return await meeting_pipeline.run(saved_paths)
    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


# ---- Additional compatibility routes for frontend compatibility ------

@router.post("/completeness")
async def completeness_legacy(zip_file: UploadFile = File(...)) -> Any:
    """Legacy completeness check endpoint - redirects to modular service."""
    from src.modules.completeness.application.services import CompletenessService
    service = CompletenessService()
    payload = await zip_file.read()
    result = await service.process(payload, zip_file.filename or "unknown")
    # Transform the result to match frontend expectations
    modules = {}
    if "report" in result and "modules" in result["report"]:
        for module_name, module_data in result["report"]["modules"].items():
            if "items" in module_data:
                modules[module_name] = {
                    "items": [
                        {
                            "module": item.get("module", module_name),
                            "checklist_title": item.get("checklist_title", ""),
                            "applicability": item.get("applicability", ""),
                            "status": item.get("status", "")
                        }
                        for item in module_data["items"]
                    ]
                }
    return success_response("completeness", {"modules": modules})


@router.post("/dossier-checker/upload")
async def dossier_checker_legacy(zip_file: UploadFile = File(...)) -> Any:
    """Legacy dossier checker endpoint - redirects to modular service."""
    from src.modules.dossier_checker.application.services import DossierCheckerService
    service = DossierCheckerService()
    payload = await zip_file.read()
    result = await service.process(payload, zip_file.filename or "unknown")
    # Return the results array directly to match frontend expectations
    return success_response("dossier_checker", result.get("results", []))


@router.post("/version-checker")
async def version_checker(zip_a: UploadFile = File(...), zip_b: UploadFile = File(...)) -> Any:
    """Compare two ZIP files and return differences."""
    from src.modules.completeness.zip_compare import compare_zips
    zip_a_bytes = await zip_a.read()
    zip_b_bytes = await zip_b.read()
    result = compare_zips(zip_a_bytes, zip_b_bytes, zip_a.filename or "zip_a", zip_b.filename or "zip_b")
    return success_response("version_checker", result)


@router.post("/consistency-check-from-blob")
async def consistency_check_from_blob(data: dict) -> Any:
    """Run consistency check using blob paths instead of uploaded files."""
    paths = data.get("paths", [])
    if not paths:
        raise HTTPException(status_code=400, detail="No blob paths provided")

    # Download files from blob storage
    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    downloaded_files = []

    try:
        for blob_path in paths:
            if AZURE_BLOB_CONTAINER_NAME:
                container = _container_client()
                blob_client = container.get_blob_client(blob=blob_path)
                downloader = blob_client.download_blob()
                payload = downloader.readall()
            else:
                upload_dir = _get_local_upload_dir()
                file_path = upload_dir / blob_path.replace("/", os.sep)
                if not file_path.exists():
                    continue
                payload = file_path.read_bytes()

            temp_file = temp_dir / f"temp_{len(downloaded_files)}.zip"
            temp_file.write_bytes(payload)
            downloaded_files.append(str(temp_file))

        if not downloaded_files:
            raise HTTPException(status_code=400, detail="No files could be downloaded")

        # Use the first file for consistency check
        from src.modules.dossier_checker.application.services import DossierCheckerService
        service = DossierCheckerService()
        with open(downloaded_files[0], "rb") as f:
            payload = f.read()
        result = await service.process(payload, "consistency_check.zip")
        return success_response("dossier_checker", result.get("results", []))

    finally:
        for temp_file in downloaded_files:
            with suppress(Exception):
                os.remove(temp_file)


@router.post("/create-zip-from-blob")
async def create_zip_from_blob(data: dict) -> StreamingResponse:
    """Create a ZIP file from blob paths and return it."""
    paths = data.get("paths", [])
    zip_name = data.get("zip_name", "blob-archive.zip")

    if not paths:
        raise HTTPException(status_code=400, detail="No blob paths provided")

    import io
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for blob_path in paths:
            try:
                if AZURE_BLOB_CONTAINER_NAME:
                    container = _container_client()
                    blob_client = container.get_blob_client(blob=blob_path)
                    downloader = blob_client.download_blob()
                    payload = downloader.readall()
                else:
                    upload_dir = _get_local_upload_dir()
                    file_path = upload_dir / blob_path.replace("/", os.sep)
                    if not file_path.exists():
                        continue
                    payload = file_path.read_bytes()

                filename = Path(blob_path).name
                zip_file.writestr(filename, payload)
            except Exception as e:
                logger.warning(f"Failed to add {blob_path} to ZIP: {e}")
                continue

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )


@router.post("/summarize-other-files")
async def summarize_other_files(
    files: list[UploadFile] = File(...),
    summary_type: str = Form("application")
) -> Any:
    """Summarize files with different summary types."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    from src.modules.summarisation.infrastructure.services.summarization_pipeline import summarization_pipeline
    from src.modules.summarisation.infrastructure.services.sae_pipeline import sae_pipeline
    from src.modules.summarisation.infrastructure.services.meeting_pipeline import meeting_pipeline

    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    file_names: list[str] = []

    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
            file_names.append(uploaded.filename or "unknown")

        # Choose pipeline based on summary_type
        if summary_type == "sae":
            result = await sae_pipeline.run(saved_paths)
        elif summary_type == "meeting":
            result = await meeting_pipeline.run(saved_paths)
        else:  # "application" or default
            result = await summarization_pipeline.run(saved_paths, "application_document_summarization")

        # Get blob paths (assuming files were uploaded to blob storage)
        blob_paths = []
        for path in saved_paths:
            # This is a simplified assumption - in reality we'd need to track blob paths
            blob_paths.append(f"uploads/{Path(path).name}")

        return success_response("summarisation", {
            "summary": result,
            "blobPaths": blob_paths,
            "fileNames": file_names
        })

    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


@router.post("/analyze-document")
async def analyze_document_legacy(
    checklist_title: str = Form(...),
    input_file: UploadFile = File(...),
) -> Any:
    """Legacy document analysis endpoint - redirects to completeness module."""
    from src.modules.completeness.relevance import check_document_relevance
    from src.modules.completeness.extract import extract_text_first_pages
    
    logger.info("Document analysis request for checklist: %s, file: %s", checklist_title, input_file.filename)
    payload = await input_file.read()
    ensure_non_empty_bytes(payload)
    
    # Extract text from the file
    extracted_text = extract_text_first_pages(input_file.filename, payload)
    
    # Check relevance
    relevance = check_document_relevance(
        checklist_title=checklist_title,
        extracted_text=extracted_text
    )
    
    return success_response("document_analysis", {
        "checklist_title": checklist_title,
        "filename": input_file.filename,
        "relevance": relevance,
        "extracted_text_length": len(extracted_text)
    })


@router.post("/classify-other-files")
async def classify_other_files_legacy(
    files: list[UploadFile] = File(...),
) -> Any:
    """Legacy classify other files endpoint - redirects to classification module."""
    from src.modules.classification.infrastructure.services.classification_pipeline import classification_pipeline
    
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    
    temp_dir = Path(os.getcwd()) / "temp_uploads"
    temp_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    file_names: list[str] = []

    try:
        for uploaded in files:
            file_path = temp_dir / (uploaded.filename or "upload.bin")
            file_path.write_bytes(await uploaded.read())
            saved_paths.append(str(file_path))
            file_names.append(uploaded.filename or "unknown")

        result = await classification_pipeline.run(saved_paths)
        
        # Get blob paths (assuming files were uploaded to blob storage)
        blob_paths = []
        for path in saved_paths:
            # This is a simplified assumption - in reality we'd need to track blob paths
            blob_paths.append(f"uploads/{Path(path).name}")

        return success_response("classification", {
            "result": result,
            "blobPaths": blob_paths,
            "fileNames": file_names
        })

    finally:
        for p in saved_paths:
            with suppress(Exception):
                os.remove(p)


@router.get("/health-workspace")
async def health_workspace() -> dict[str, Any]:
    return success_response("workspace", {"ok": True})

