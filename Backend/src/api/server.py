from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.middleware.error_handler import register_exception_handlers
from src.api.routers import workspace_router
from src.modules.anonymisation.infrastructure.api import router as anonymisation_router
from src.modules.classification.infrastructure.api import router as classification_router
from src.modules.completeness.infrastructure.api import router as completeness_router
from src.modules.dossier_checker.infrastructure.api import router as dossier_checker_router
from src.modules.drug_analyzer.infrastructure.api.router import router as drug_analyzer_router
from src.modules.summarisation.infrastructure.api import router as summarisation_router
from src.shared.types import success_response
from src.utils.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title="CDSCO Demo API",
    description="Document processing and analysis",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# Workspace endpoints consumed by frontend (upload/tree/blob helpers + v1 compatibility).
app.include_router(workspace_router, tags=["Workspace"])

app.include_router(anonymisation_router, prefix="/api/anonymisation", tags=["Anonymisation"])
app.include_router(classification_router, prefix="/api/classification", tags=["Classification"])
app.include_router(completeness_router, prefix="/api/completeness", tags=["Completeness"])
app.include_router(summarisation_router, prefix="/api/summarisation", tags=["Summarisation"])
app.include_router(dossier_checker_router, prefix="/api/dossier", tags=["Dossier Checker"])
app.include_router(drug_analyzer_router, tags=["Drug Analyzer"])


@app.get("/health")
async def health() -> dict:
    """Health endpoint for demo readiness checks."""
    return success_response("api", {"status": "healthy", "version": app.version})


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Application starting")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("Application shutting down")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
