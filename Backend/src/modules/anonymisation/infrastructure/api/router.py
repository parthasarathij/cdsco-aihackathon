from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from src.modules.anonymisation.application.services import AnonymisationService
from src.shared.types import success_response
from src.utils.logger import get_logger
from src.utils.validators import ensure_non_empty_bytes

router = APIRouter()
logger = get_logger(__name__)


def get_service() -> AnonymisationService:
    return AnonymisationService()


@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    service: AnonymisationService = Depends(get_service),
):
    """Process a document for anonymisation."""
    logger.info("Anonymisation request received for %s", file.filename)
    payload = await file.read()
    ensure_non_empty_bytes(payload)
    result = await service.process(payload, file.filename or "unknown")
    return success_response("anonymisation", result)
