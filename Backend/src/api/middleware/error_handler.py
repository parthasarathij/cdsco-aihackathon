from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from src.shared.types import error_response
from src.utils.logger import get_logger

logger = get_logger(__name__)


def register_exception_handlers(app) -> None:
    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        logger.error("HTTP exception on %s: %s", request.url.path, exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response("api", str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception on %s: %s", request.url.path, str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content=error_response("api", "Internal server error"),
        )
