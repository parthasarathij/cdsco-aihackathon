from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import io
import json
import os
import uuid
import zipfile
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from azure.storage.blob import BlobServiceClient

from .models import AnonymisationMode
from .docx_anonymiser import process_docx_bytes
from .pdf_anonymiser import process_pdf_bytes

router = APIRouter()

# Injected from main.py after model startup
_detector  = None
_anonymiser = None


def set_singletons(detector, anonymiser) -> None:
    """Call from startup_event() to inject pre-loaded singletons."""
    global _detector, _anonymiser
    _detector  = detector
    _anonymiser = anonymiser


#  helpers 

def _require_docx(filename: str) -> None:
    if not (filename or "").lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="Only .docx files are supported. Please convert your document first.",
        )

def _file_kind(filename: str) -> str:
    fn = (filename or "").lower()
    if fn.endswith(".docx"):
        return "docx"
    if fn.endswith(".pdf"):
        return "pdf"
    raise HTTPException(
        status_code=400,
        detail="Only .docx and .pdf files are supported.",
    )

def _require_content(content: bytes) -> None:
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")


def _store_generated_file(file_bytes: bytes, target_prefix_env: str, filename: str) -> str | None:
    conn = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    container = os.getenv("AZURE_BLOB_CONTAINER_NAME", "").strip()
    target_prefix = os.getenv(target_prefix_env, "").strip(" /")
    if not (conn and container and target_prefix and file_bytes):
        return None
    safe_name = filename.replace("\\", "_").replace("/", "_")
    blob_path = f"{target_prefix}/{uuid.uuid4().hex[:8]}_{safe_name}"
    client = BlobServiceClient.from_connection_string(conn).get_container_client(container).get_blob_client(blob_path)
    client.upload_blob(file_bytes, overwrite=True)
    return blob_path


#  POST /process-docx 

@router.post(
    "/process-docx",
    summary="Upload .docx → ZIP with pseudo doc + full-anon doc + JSON report",
    tags=["Anonymisation"],
)
async def process_docx(
    file:           UploadFile        = File(...,  description=".docx file to anonymise"),
    mode:           AnonymisationMode = Form(AnonymisationMode.both,
                                            description="pseudo | full | both"),
    return_mapping: bool              = Form(False, description="Include full mapping table in JSON"),
    salt:           Optional[str]     = Form(None,  description="HMAC salt for deterministic tokens"),
):
    """
    Accepts a **.docx** file and returns a **ZIP** containing:

    - `<name>_pseudo.docx`
        Same layout as original. Every PII value replaced in-place with a
        reversible token (e.g. `PER_A1B2C3`, `DTE_F0E33E47`).

    - `<name>_full_anonymised.docx`
        Same layout as original. Every PII value replaced in-place with a
        generalised irreversible replacement
        (e.g. `[REDACTED]`, `[DATE_REDACTED]`, `****@domain.com`, `60-69`).

    - `<name>_report.json`
        `changes[]` — every unique entity with both `pseudo_value` and
        `full_anon_value` on the same row, plus entity_type, confidence,
        detection_source, occurrences.
        `pseudo_document` and `full_anon_document` — full replaced text strings.
        `mapping_excel_url` — Excel mapping download link (mode=pseudo|both).
    """
    kind = _file_kind(file.filename)
    content = await file.read()
    _require_content(content)

    if kind == "docx":
        result = process_docx_bytes(
            file_bytes     = content,
            mode           = mode.value,
            salt           = salt,
            return_mapping = return_mapping,
            detector       = _detector,
            anonymiser     = _anonymiser,
        )
        pseudo_bytes = result.pseudo_docx_bytes
        full_bytes = result.full_anon_docx_bytes
        report = result.combined_json
        ext = "docx"
        pseudo_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        result = process_pdf_bytes(
            file_bytes     = content,
            mode           = mode.value,
            salt           = salt,
            return_mapping = return_mapping,
            detector       = _detector,
        )
        pseudo_bytes = result.pseudo_pdf_bytes
        full_bytes = result.full_anon_pdf_bytes
        report = result.combined_json
        ext = "pdf"
        pseudo_mime = "application/pdf"

    stem = file.filename.rsplit(".", 1)[0] if file.filename else "document"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # pseudo doc
        if pseudo_bytes:
            zf.writestr(f"{stem}_pseudo.{ext}", pseudo_bytes)
        # full anon doc
        if full_bytes:
            zf.writestr(f"{stem}_full_anonymised.{ext}", full_bytes)
        # JSON report
        zf.writestr(
            f"{stem}_report.json",
            json.dumps(report, ensure_ascii=False, indent=2),
        )
    zip_buf.seek(0)

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{stem}_anonymised.zip"'},
    )


#  POST /upload-docx  (backward-compat alias) 

@router.post(
    "/upload-docx",
    summary="Upload .docx → ZIP (alias for /process-docx)",
    tags=["Anonymisation"],
)
async def upload_docx(
    file:           UploadFile        = File(...),
    mode:           AnonymisationMode = Form(AnonymisationMode.both),
    return_mapping: bool              = Form(False),
    salt:           Optional[str]     = Form(None),
):
    """Backward-compatible alias — same behaviour as POST /process-docx."""
    return await process_docx(
        file=file, mode=mode, return_mapping=return_mapping, salt=salt,
    )


#  POST /upload-docx/pseudo 

@router.post(
    "/upload-docx/pseudo",
    summary="Upload .docx → pseudo-anonymised .docx only",
    tags=["Anonymisation"],
)
async def upload_docx_pseudo(
    file: UploadFile    = File(...),
    salt: Optional[str] = Form(None),
):
    """
    Returns only the pseudo-anonymised .docx as a direct file download.
    Same layout as original — every PII replaced with a reversible token.
    """
    kind = _file_kind(file.filename)
    content = await file.read()
    _require_content(content)

    if kind == "docx":
        result = process_docx_bytes(
            file_bytes     = content,
            mode           = "pseudo",
            salt           = salt,
            return_mapping = False,
            detector       = _detector,
            anonymiser     = _anonymiser,
        )
        out_bytes = result.pseudo_docx_bytes
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
    else:
        result = process_pdf_bytes(
            file_bytes     = content,
            mode           = "pseudo",
            salt           = salt,
            return_mapping = False,
            detector       = _detector,
        )
        out_bytes = result.pseudo_pdf_bytes
        mime = "application/pdf"
        ext = "pdf"

    if not out_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate pseudo-anonymised document.")

    stem = file.filename.rsplit(".", 1)[0] if file.filename else "document"
    stored_blob_path = _store_generated_file(out_bytes, "pseudo_files", f"{stem}_pseudo.{ext}")
    return StreamingResponse(
        io.BytesIO(out_bytes),
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{stem}_pseudo.{ext}"',
            "X-Blob-Path": stored_blob_path or "",
        },
    )


#  POST /upload-docx/full 

@router.post(
    "/upload-docx/full",
    summary="Upload .docx → fully anonymised .docx only",
    tags=["Anonymisation"],
)
async def upload_docx_full(
    file: UploadFile = File(...),
):
    """
    Returns only the fully anonymised .docx as a direct file download.
    Same layout as original — every PII replaced with a generalised value.
    """
    kind = _file_kind(file.filename)
    content = await file.read()
    _require_content(content)

    if kind == "docx":
        result = process_docx_bytes(
            file_bytes     = content,
            mode           = "full",
            return_mapping = False,
            detector       = _detector,
            anonymiser     = _anonymiser,
        )
        out_bytes = result.full_anon_docx_bytes
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
    else:
        result = process_pdf_bytes(
            file_bytes     = content,
            mode           = "full",
            return_mapping = False,
            detector       = _detector,
        )
        out_bytes = result.full_anon_pdf_bytes
        mime = "application/pdf"
        ext = "pdf"

    if not out_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate fully anonymised document.")

    stem = file.filename.rsplit(".", 1)[0] if file.filename else "document"
    stored_blob_path = _store_generated_file(out_bytes, "full_files", f"{stem}_full_anonymised.{ext}")
    return StreamingResponse(
        io.BytesIO(out_bytes),
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{stem}_full_anonymised.{ext}"',
            "X-Blob-Path": stored_blob_path or "",
        },
    )


#  POST /upload-docx/json 

@router.post(
    "/upload-docx/json",
    summary="Upload .docx → JSON report only (no file download)",
    tags=["Anonymisation"],
)
async def upload_docx_json_only(
    file:           UploadFile        = File(...),
    mode:           AnonymisationMode = Form(AnonymisationMode.both),
    return_mapping: bool              = Form(True),
    salt:           Optional[str]     = Form(None),
):
    """Returns JSON report only — same shape as POST /process."""
    kind = _file_kind(file.filename)
    content = await file.read()
    _require_content(content)

    if kind == "docx":
        result = process_docx_bytes(
            file_bytes     = content,
            mode           = mode.value,
            salt           = salt,
            return_mapping = return_mapping,
            detector       = _detector,
            anonymiser     = _anonymiser,
        )
        report = result.combined_json
    else:
        result = process_pdf_bytes(
            file_bytes     = content,
            mode           = mode.value,
            salt           = salt,
            return_mapping = return_mapping,
            detector       = _detector,
        )
        report = result.combined_json
    return JSONResponse(content=report)