from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from src.modules.completeness.application.services import CompletenessService
from src.modules.completeness.relevance import check_document_relevance
from src.modules.completeness.extract import extract_text_first_pages
from src.shared.types import success_response
from src.utils.logger import get_logger
from src.utils.validators import ensure_non_empty_bytes

router = APIRouter()
logger = get_logger(__name__)


def get_service() -> CompletenessService:
    return CompletenessService()


@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    service: CompletenessService = Depends(get_service),
):
    """Process dossier ZIP for completeness checks."""
    logger.info("Completeness request received for %s", file.filename)
    payload = await file.read()
    ensure_non_empty_bytes(payload)
    result = await service.process(payload, file.filename or "unknown")
    return success_response("completeness", result)


@router.post("/analyze-document")
async def analyze_document(
    checklist_title: str = Form(...),
    input_file: UploadFile = File(...),
):
    """Check document relevance against a checklist item."""
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
