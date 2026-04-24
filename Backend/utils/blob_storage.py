from __future__ import annotations

import os
from datetime import datetime, timezone

from azure.storage.blob import BlobServiceClient, ContentSettings


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def blob_logs_path(filename: str) -> str:
    root = _env("AZURE_BLOB_FOLDER_NAME").strip(" /")
    # Prefer explicit app log prefix (matches Backend/.env `application_logs`)
    app_logs_prefix = (_env("application_logs") or _env("APPLICATION_LOGS")).strip().strip(" /")
    if app_logs_prefix:
        return f"{root}/{app_logs_prefix}/{filename}".strip("/") if root else f"{app_logs_prefix}/{filename}".strip("/")
    # Fallback to legacy location
    return f"{root}/data/logs/{filename}".strip("/") if root else f"data/logs/{filename}".strip("/")


def _blob_service_client() -> BlobServiceClient:
    conn = _env("AZURE_STORAGE_CONNECTION_STRING")
    if conn:
        return BlobServiceClient.from_connection_string(conn)
    account = _env("AZURE_STORAGE_ACCOUNT_NAME")
    key = _env("AZURE_STORAGE_ACCOUNT_KEY")
    if account and key:
        return BlobServiceClient(account_url=f"https://{account}.blob.core.windows.net", credential=key)
    raise RuntimeError("Azure storage is not configured for blob logging.")


def append_to_blob(blob_path: str, text: str) -> None:
    """Best-effort append for demo logging (creates/overwrites)."""
    container = _env("AZURE_BLOB_CONTAINER_NAME")
    if not container:
        return
    try:
        client = _blob_service_client()
        blob_client = client.get_blob_client(container=container, blob=blob_path)
        try:
            existing = blob_client.download_blob().readall().decode("utf-8")
        except Exception:
            existing = ""
        payload = f"{existing}{text}"
        blob_client.upload_blob(
            payload,
            overwrite=True,
            content_settings=ContentSettings(content_type="text/plain"),
        )
    except Exception:
        # Logging must never crash the app.
        return


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

