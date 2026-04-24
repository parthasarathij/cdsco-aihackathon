from __future__ import annotations

import os
import tempfile

from ..infrastructure.services.classification_pipeline import classification_pipeline
from ..infrastructure.services.llm_service import llm_service
from src.utils.logger import get_logger

logger = get_logger(__name__)


class ClassificationService:
    async def process(self, file_bytes: bytes, filename: str) -> dict:
        suffix = os.path.splitext(filename or "document.txt")[1] or ".txt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name
        try:
            results = await classification_pipeline.run([temp_path])
            return {"filename": filename, "results": results}
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


__all__ = ["classification_pipeline", "llm_service", "ClassificationService"]