import os

# Silence noisy ML libraries in console for demo runs.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("ABSL_MIN_LOG_LEVEL", "3")

from src.api.server import app
from utils.logger import get_logger

logger = get_logger(__name__)

# This allows uvicorn main:app --reload to work correctly
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting application with uvicorn")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
