from .summary_loader import ensure_summary_on_path
from src.utils.logger import get_logger
logger = get_logger(__name__)

ensure_summary_on_path()

from app.services.classification_pipeline import classification_pipeline

__all__ = ["classification_pipeline"]