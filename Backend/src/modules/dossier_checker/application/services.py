from __future__ import annotations

from constants.dossier_field_config import FIELDS
from fastapi import HTTPException

from utils.dossier_extractor import extract_module_texts
from utils.dossier_llm_checker import check_all_fields
from src.utils.logger import get_logger

logger = get_logger(__name__)


class DossierCheckerService:
    async def process(self, file_bytes: bytes, filename: str) -> dict:
        if not (filename or "").lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip files are supported")
        module_texts = extract_module_texts(file_bytes)
        if not module_texts:
            raise HTTPException(status_code=422, detail="No readable PDFs found in ZIP")
        field_names = [field["name"] for field in FIELDS]
        results = await check_all_fields(field_names, module_texts)
        return {"filename": filename, "results": results}
