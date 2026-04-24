import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from src.utils.logger import get_logger
logger = get_logger(__name__)

class Settings(BaseSettings):
    PROJECT_NAME: str = "SAE Classification Engine"
    API_V1_STR: str = "/api/v1"
    
    # Azure Storage
    AZURE_STORAGE_CONNECTION_STRING: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    AZURE_BLOB_CONTAINER_NAME: str = os.getenv("AZURE_BLOB_CONTAINER_NAME", "documents")
    
    # Application data prefix for classify-other-files endpoint
    APPLICATION_DATA_PREFIX: str = os.getenv("application_Data", "application_data").replace("\\", "/").strip().strip("/")
    
    LOCAL_MISTRAL_MODEL_PATH: str = os.getenv("LOCAL_MISTRAL_MODEL_PATH", "mistralai/Mistral-7B-Instruct-v0.3")
    HUGGINGFACE_TOKEN: str = os.getenv("HUGGINGFACE_TOKEN", "")
    HUGGINGFACE_MODEL: str = os.getenv("HUGGINGFACE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
    

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
