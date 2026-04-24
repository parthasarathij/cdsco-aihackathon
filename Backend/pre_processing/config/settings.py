import os
from contextlib import suppress
from pathlib import Path
from utils.logger import get_logger
logger = get_logger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DOTENV_PATH = BASE_DIR / ".env"

if DOTENV_PATH.exists():
    with suppress(ImportError):
        from dotenv import load_dotenv

        load_dotenv(dotenv_path=DOTENV_PATH)


# INPUT DATA
IMAGE_DIR = os.getenv("IMAGE_DIR")

# OUTPUT DIRS
BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", "data/output")
JSON_DIR = os.getenv("JSON_DIR", os.path.join(BASE_OUTPUT_DIR, "json"))
PDF_DIR = os.getenv("PDF_DIR", os.path.join(BASE_OUTPUT_DIR, "pdf"))

# MODEL PATHS (BLOB STORAGE)
BLOB_LAYOUT_MODEL_DIR = os.getenv("BLOB_LAYOUT_MODEL_DIR", "models/layout/PP-DocLayout_plus-L_infer/")
BLOB_TABLE_MODEL_DIR = os.getenv("BLOB_TABLE_MODEL_DIR", "models/table/RT-DETR-L_wired_table_cell_det_infer/")

# Local paths for models (can be configured via .env)
LAYOUT_MODEL_DIR = os.getenv("LAYOUT_MODEL_DIR", os.path.join("models", "layout", "PP-DocLayout_plus-L_infer"))
TABLE_MODEL_DIR = os.getenv("TABLE_MODEL_DIR", os.path.join("models", "table", "RT-DETR-L_wired_table_cell_det_infer"))

# LOG SETTINGS
LOG_NAME = os.getenv("LOG_NAME", "OCR_PIPELINE")

# CORS settings
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
] or DEFAULT_CORS_ORIGINS

# AZURE BLOB STORAGE
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
AZURE_STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "")
AZURE_STORAGE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_ACCOUNT_KEY", "")
AZURE_STORAGE_SAS_TOKEN = os.getenv("AZURE_STORAGE_SAS_TOKEN", "")
AZURE_BLOB_CONTAINER_NAME = os.getenv("AZURE_BLOB_CONTAINER_NAME", "")
AZURE_BLOB_FOLDER_NAME = os.getenv("AZURE_BLOB_FOLDER_NAME", "")

USE_AZURE_BLOB = bool(
    AZURE_BLOB_CONTAINER_NAME
    and (
        AZURE_STORAGE_CONNECTION_STRING
        or AZURE_STORAGE_ACCOUNT_KEY
        or AZURE_STORAGE_SAS_TOKEN
    )
)

# LOCAL DIRECTORY PATHS (TEMPORARY/TRANSIENT)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join("data", "uploads"))
INPUT_DIR = os.getenv("INPUT_DIR", os.path.join("data", "input"))
OUTPUT_DIR = os.getenv("OUTPUT_DIR", os.path.join("data", "output"))
LOGS_DIR = os.getenv("LOGS_DIR", os.path.join("data", "logs"))
ASSETS_DIR = os.getenv("ASSETS_DIR", os.path.join("assets"))
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join("models"))
