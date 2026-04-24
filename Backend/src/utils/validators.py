from __future__ import annotations

from fastapi import HTTPException


def ensure_non_empty_bytes(payload: bytes, field_name: str = "file") -> None:
    if not payload:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
