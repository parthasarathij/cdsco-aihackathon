import logging
import os
import sys
import json
from datetime import datetime
from contextvars import ContextVar

from datetime import timezone
from utils.blob_storage import append_to_blob, blob_logs_path

# Context variable for correlation ID
correlation_id_context: ContextVar[str] = ContextVar('correlation_id', default='unknown')


class BlobStorageHandler(logging.Handler):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename

    def emit(self, record):
        try:
            msg = self.format(record)
            blob_path = blob_logs_path(self.filename)
            append_to_blob(blob_path, msg + '\n')
        except Exception:
            self.handleError(record)


class CorrelationIDFilter(logging.Filter):
    def filter(self, record):
        record.correlation_id = correlation_id_context.get('unknown')
        return True


def get_logger(name="doc_pipeline", log_dir=None):
    # NOTE: This logger is used across multiple packages (including `src` and
    # `pre_processing`). Keep it self-contained: do NOT import pre_processing
    # settings here, otherwise it can create circular imports at import time.
    use_blob_flag = (os.getenv("USE_AZURE_BLOB") or "").strip().lower() in {"1", "true", "yes", "y"}
    # If Azure is configured, default to blob logging even if flag isn't set.
    azure_configured = bool(
        (os.getenv("AZURE_BLOB_CONTAINER_NAME") or "").strip()
        and (
            (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
            or (
                (os.getenv("AZURE_STORAGE_ACCOUNT_NAME") or "").strip()
                and (os.getenv("AZURE_STORAGE_ACCOUNT_KEY") or "").strip()
            )
        )
    )
    use_blob = use_blob_flag or azure_configured

    log_filename = datetime.now().strftime('%Y-%m-%d_%H') + '_logs.txt'

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    # Prevent duplicate handlers
    if logger.handlers:
        return logger

    # Create correlation ID filter
    correlation_filter = CorrelationIDFilter()

    # Enhanced formatter with correlation ID support
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - [correlation_id=%(correlation_id)s] - %(message)s'
    )

    if use_blob:
        try:
            blob_handler = BlobStorageHandler(log_filename)
            _extracted_from_get_logger_26(
                blob_handler, formatter, correlation_filter, logger
            )
        except Exception as e:
            log_error(logger, "Failed to add BlobStorageHandler", e)
    else:
        # Local file handler
        if log_dir is None:
            log_dir = (os.getenv("LOGS_DIR") or "logs").strip() or "logs"
        os.makedirs(log_dir, exist_ok=True)
        log_filepath = os.path.join(log_dir, log_filename)

        file_handler = logging.FileHandler(log_filepath, encoding='utf-8')
        _extracted_from_get_logger_26(
            file_handler, formatter, correlation_filter, logger
        )
    # Do NOT log to console (demo requirement). Only blob/file handlers are configured.
    # Store log filename for reference
    logger.log_filename = log_filename

    # Avoid noisy console output; keep initialization silent.

    return logger


def _extracted_from_get_logger_26(arg0, arg1, correlation_filter, logger):
    arg0.setFormatter(arg1)
    arg0.addFilter(correlation_filter)
    logger.addHandler(arg0)


def set_correlation_id(correlation_id: str):
    """Set correlation ID in context."""
    correlation_id_context.set(correlation_id)


def get_correlation_id() -> str:
    """Get correlation ID from context."""
    return correlation_id_context.get('unknown')


def log_session_event(
    logger,
    event_type: str,
    session_id: str,
    user_id: str = None,
    details: dict = None,
    correlation_id: str = None
):
    event_data = {
        "event_type": event_type,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "correlation_id": correlation_id or get_correlation_id(),
    }

    if user_id:
        event_data["user_id"] = user_id

    if details:
        event_data["details"] = details

    logger.info(f"SESSION_EVENT: {json.dumps(event_data)}")


def log_error(logger, context: str, e: Exception, correlation_id: str = None):
    correlation_id = correlation_id or get_correlation_id()
    error_data = {
        "error_context": context,
        "error_type": type(e).__name__,
        "error_message": str(e),
        "correlation_id": correlation_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if logger:
        logger.error(f"ERROR: {json.dumps(error_data)}", exc_info=True)
    else:
        sys.stderr.write(f"ERROR: {json.dumps(error_data)}\n")