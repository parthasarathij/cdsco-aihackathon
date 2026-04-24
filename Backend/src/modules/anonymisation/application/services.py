from __future__ import annotations

import io

from docx import Document as DocxDocument
from fastapi import HTTPException

from src.modules.anonymisation.anonymizer import DocumentAnonymiser
from src.modules.anonymisation.detector import EntityDetector
from src.modules.anonymisation.models import AnonymisationMode, DocumentRequest
from src.utils.logger import get_logger

logger = get_logger(__name__)


class AnonymisationService:
    def __init__(self) -> None:
        self._detector = EntityDetector()
        self._anonymiser = DocumentAnonymiser()

    async def process(self, file_bytes: bytes, filename: str) -> dict:
        text = self._extract_text(file_bytes=file_bytes, filename=filename)
        if not text.strip():
            raise HTTPException(status_code=400, detail="No readable text found")

        req = DocumentRequest(text=text, mode=AnonymisationMode.both, return_mapping=False, salt=None)
        entities = self._detector.detect(req.text)
        pseudo_text, full_anon_text, _ = self._anonymiser.anonymise(
            text=req.text,
            entities=entities,
            mode=req.mode,
            salt=req.salt,
        )
        return {
            "filename": filename,
            "entityCount": len(entities),
            "pseudoDocument": pseudo_text,
            "fullAnonymisedDocument": full_anon_text,
        }

    @staticmethod
    def _extract_text(file_bytes: bytes, filename: str) -> str:
        lowered = (filename or "").lower()
        if lowered.endswith(".docx"):
            doc = DocxDocument(io.BytesIO(file_bytes))
            return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1")
