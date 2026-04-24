import os
from pathlib import Path
from typing import Optional, Union
from utils.logger import get_logger
logger = get_logger(__name__)

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import BlobServiceClient, ContentSettings

from config import settings


def _load_blob_service_client() -> BlobServiceClient:
    if settings.AZURE_STORAGE_CONNECTION_STRING:
        return BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)

    if settings.AZURE_STORAGE_ACCOUNT_NAME and settings.AZURE_STORAGE_ACCOUNT_KEY:
        account_url = f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=settings.AZURE_STORAGE_ACCOUNT_KEY)

    if settings.AZURE_STORAGE_ACCOUNT_NAME and settings.AZURE_STORAGE_SAS_TOKEN:
        account_url = f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=settings.AZURE_STORAGE_SAS_TOKEN)

    raise ValueError("Azure storage credentials are not configured.")


def get_container_client():
    if not settings.AZURE_BLOB_CONTAINER_NAME:
        raise ValueError("AZURE_BLOB_CONTAINER_NAME must be set to use Azure Blob storage.")

    service_client = _load_blob_service_client()
    container_client = service_client.get_container_client(settings.AZURE_BLOB_CONTAINER_NAME)
    try:
        container_client.create_container()
    except ResourceExistsError:
        pass
    return container_client


def build_blob_name(*parts: str) -> str:
    cleaned_parts = []
    for part in parts:
        if not part:
            continue
        cleaned_parts.extend([segment for segment in part.split("/") if segment])
    return "/".join(cleaned_parts)


def build_job_blob_prefix(job_name: str) -> str:
    """Backward-compatible helper – kept for migration; new code should use
    explicit blob path builders below."""
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, f"jobs/{job_name}")


def blob_upload_path(filename: str) -> str:
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, "data/uploads", filename)


def blob_input_path(job_name: str, filename: str = "") -> str:
    parts = [settings.AZURE_BLOB_FOLDER_NAME, "data/input", job_name]
    if filename:
        parts.append(filename)
    return build_blob_name(*parts)


def blob_output_json_path(filename: str) -> str:
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, "data/output/json", filename)


def blob_output_pdf_path(filename: str) -> str:
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, "data/output/pdf", filename)


def blob_assets_path(job_name: str, filename: str = "") -> str:
    parts = [settings.AZURE_BLOB_FOLDER_NAME, "assets", job_name]
    if filename:
        parts.append(filename)
    return build_blob_name(*parts)


def blob_logs_path(filename: str) -> str:
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, "data/logs", filename)


def blob_job_prefix(job_name: str) -> str:
    return build_blob_name(settings.AZURE_BLOB_FOLDER_NAME, job_name)


def _content_type_for_path(path: Union[str, Path]) -> str:
    import mimetypes

    content_type, _ = mimetypes.guess_type(str(path))
    return content_type or "application/octet-stream"


def upload_file(local_path: Union[str, Path], blob_name: str, content_type: Optional[str] = None) -> str:
    container_client = get_container_client()
    blob_client = container_client.get_blob_client(blob_name)
    content_settings = ContentSettings(content_type=content_type or _content_type_for_path(local_path))

    with open(local_path, "rb") as source:
        blob_client.upload_blob(source, overwrite=True, content_settings=content_settings)

    return get_blob_url(blob_name)


def upload_bytes(data: bytes, blob_name: str, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes directly to blob storage without saving to disk."""
    container_client = get_container_client()
    blob_client = container_client.get_blob_client(blob_name)
    content_settings = ContentSettings(content_type=content_type)

    blob_client.upload_blob(data, overwrite=True, content_settings=content_settings)

    return get_blob_url(blob_name)



def upload_directory(local_dir: Union[str, Path], blob_prefix: str) -> list[str]:
    local_dir = Path(local_dir)
    if not local_dir.exists():
        return []

    urls = []
    for path in sorted(local_dir.glob("*")):
        if path.is_file():
            blob_name = build_blob_name(blob_prefix, path.name)
            urls.append(upload_file(path, blob_name))
    return urls


def delete_prefix(prefix: str) -> list[str]:
    container_client = get_container_client()
    deleted = []
    for blob in container_client.list_blobs(name_starts_with=prefix):
        container_client.delete_blob(blob.name)
        deleted.append(blob.name)
    return deleted


def get_blob_url(blob_name: str) -> str:
    if settings.AZURE_STORAGE_SAS_TOKEN:
        if not settings.AZURE_STORAGE_ACCOUNT_NAME:
            raise ValueError("AZURE_STORAGE_ACCOUNT_NAME must be configured to build SAS URLs.")

        base_url = (
            f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/"
            f"{settings.AZURE_BLOB_CONTAINER_NAME}/{blob_name}"
        )
        delimiter = "&" if settings.AZURE_STORAGE_SAS_TOKEN.startswith("?") else "?"
        return base_url + delimiter + settings.AZURE_STORAGE_SAS_TOKEN.lstrip("?")

    client = _load_blob_service_client()
    blob_client = client.get_blob_client(container=settings.AZURE_BLOB_CONTAINER_NAME, blob=blob_name)
    return blob_client.url


def append_to_blob(blob_name: str, text: str) -> None:
    """Append a line of text to a blob (creates if not exists)."""
    container_client = get_container_client()
    blob_client = container_client.get_blob_client(blob_name)
    try:
        existing = blob_client.download_blob().readall().decode("utf-8")
        text = existing + text
    except Exception:
        pass  # blob doesn't exist yet, just write the new text
    blob_client.upload_blob(text, overwrite=True, content_settings=ContentSettings(content_type="text/plain"))


def download_directory(blob_prefix: str, local_dir: Union[str, Path]) -> None:
    import os
    from pathlib import Path

    container_client = get_container_client()
    local_dir = Path(local_dir)
    local_dir.mkdir(parents=True, exist_ok=True)

    prefix_len = len(blob_prefix.rstrip('/')) + 1  

    for blob in container_client.list_blobs(name_starts_with=blob_prefix):
        relative_path = blob.name[prefix_len:]
        if not relative_path:
            continue  

        local_path = local_dir / relative_path
        local_path.parent.mkdir(parents=True, exist_ok=True)

        blob_client = container_client.get_blob_client(blob.name)
        with open(local_path, "wb") as f:
            f.write(blob_client.download_blob().readall())
