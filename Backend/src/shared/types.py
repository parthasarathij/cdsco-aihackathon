from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ResponseMetadata(BaseModel):
    module: str
    timestamp: str
    version: str = "v1"


class StandardResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: str | None = None
    metadata: ResponseMetadata


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def success_response(module: str, data: Any) -> dict[str, Any]:
    return StandardResponse[Any](
        success=True,
        data=data,
        error=None,
        metadata=ResponseMetadata(module=module, timestamp=utc_timestamp()),
    ).model_dump()


def error_response(module: str, message: str) -> dict[str, Any]:
    return StandardResponse[Any](
        success=False,
        data=None,
        error=message,
        metadata=ResponseMetadata(module=module, timestamp=utc_timestamp()),
    ).model_dump()
