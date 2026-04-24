from __future__ import annotations

import os
import tempfile

from ..infrastructure.services.summarization_pipeline import summarization_pipeline
from ..infrastructure.services.sae_pipeline import sae_pipeline
from ..infrastructure.services.meeting_pipeline import meeting_pipeline
from ..infrastructure.services.llm_service import llm_service
from src.utils.logger import get_logger

logger = get_logger(__name__)


class SummarisationService:
    async def process(self, file_bytes: bytes, filename: str) -> dict:
        suffix = os.path.splitext(filename or "document.txt")[1] or ".txt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name
        try:
            result = await summarization_pipeline.run([temp_path], "application_document_summarization")
            return {"filename": filename, "summary": result}
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


__all__ = [
    "summarization_pipeline",
    "sae_pipeline",
    "meeting_pipeline",
    "llm_service",
    "SummarisationService",
]