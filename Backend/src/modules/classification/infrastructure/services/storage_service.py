import os
import io
import json
import logging
from azure.storage.blob import BlobServiceClient
from ...core.config import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

class StorageService:
    def __init__(self):
        """
        Initialize Azure Blob Storage service.
        """
        self.connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
        self.blob_service_client = None
        self.container_client = None
        self.container_name = None

        if not self.connection_string:
            return

        try:
            self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)
            self.container_name = settings.AZURE_BLOB_CONTAINER_NAME
            self.container_client = self.blob_service_client.get_container_client(self.container_name)

            try:
                if not self.container_client.exists():
                    self.container_client.create_container()
            except Exception as e:
                logger.warning(f"Could not create/verify Azure container: {e}")
        except Exception as e:
            # Demo-safe: allow app import even with placeholder/malformed connection strings.
            logger.warning(f"Azure storage not configured correctly. Disabling blob storage. Error: {e}")
            self.blob_service_client = None
            self.container_client = None
            self.container_name = None

    def save_extracted_page(self, file_name: str, page_number: int, raw_text: str):
        """
        Save extracted page data to Azure Blob Storage.
        """
        if not self.blob_service_client:
            logger.debug(f"Storage not configured. Skipping save for {file_name} page {page_number}")
            return
            
        data = {
            "file_name": file_name,
            "page_number": page_number,
            "raw_text": raw_text
        }
        blob_name = f"extracted/{file_name}/page_{page_number}.json"
        
        blob_client = self.container_client.get_blob_client(blob=blob_name)
        blob_client.upload_blob(json.dumps(data), overwrite=True)

    def load_extracted_page(self, file_name: str, page_number: int) -> dict:
        """
        Load extracted page data from Azure Blob Storage.
        """
        if not self.blob_service_client:
            return {
                "file_name": file_name, 
                "page_number": page_number, 
                "raw_text": "Mock text content for testing"
            }

        blob_name = f"extracted/{file_name}/page_{page_number}.json"
        blob_client = self.container_client.get_blob_client(blob=blob_name)
        
        downloader = blob_client.download_blob()
        data = json.loads(downloader.readall())
        return data

storage_service = StorageService()
