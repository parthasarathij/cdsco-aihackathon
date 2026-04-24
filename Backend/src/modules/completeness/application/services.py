from __future__ import annotations

import os
import tempfile
import zipfile
from pathlib import Path

from fastapi import HTTPException

from src.modules.completeness.match import check_folder_against_checklist
from src.utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_CHECKLIST_FILE = "CDSCO_CTD_Dossier_Checklist_Updated.xlsx"


class CompletenessService:
    async def process(self, file_bytes: bytes, filename: str) -> dict:
        if not (filename or "").lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip files are supported")

        checklist = self._resolve_checklist_file()
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "upload.zip"
            zip_path.write_bytes(file_bytes)
            extract_dir = Path(td) / "extracted"
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(str(zip_path), "r") as archive:
                archive.extractall(str(extract_dir))

            entries = [p for p in extract_dir.iterdir() if p.name not in {"__MACOSX"}]
            dossier_root = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_dir
            report = check_folder_against_checklist(
                checklist_xlsx=checklist,
                dossier_folder=dossier_root,
            )
        return {"filename": filename, "report": report}

    @staticmethod
    def _resolve_checklist_file() -> str:
        # Checklist is packaged with the completeness module for demo portability.
        module_root = Path(__file__).resolve().parents[2]  # .../modules/completeness
        preferred = module_root / DEFAULT_CHECKLIST_FILE
        if preferred.exists():
            return str(preferred)
        candidates = sorted(module_root.glob("*.xlsx"))
        if not candidates:
            raise HTTPException(status_code=500, detail="Checklist file not found")
        return str(candidates[0])
