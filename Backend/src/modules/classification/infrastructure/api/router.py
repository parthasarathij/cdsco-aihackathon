from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from src.modules.classification.application.services import ClassificationService
from src.shared.types import success_response
from src.utils.logger import get_logger
from src.utils.validators import ensure_non_empty_bytes

router = APIRouter()
logger = get_logger(__name__)


def get_service() -> ClassificationService:
    return ClassificationService()


@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    service: ClassificationService = Depends(get_service),
):
    """Process a document for classification."""
    logger.info("Classification request received for %s", file.filename)
    payload = await file.read()
    ensure_non_empty_bytes(payload)
    result = await service.process(payload, file.filename or "unknown")
    return success_response("classification", result)
