from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import hashlib
import json
import re
from pathlib import Path
from typing import Iterable

from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma

from .langchain_embeddings import LocalAllMiniLMEmbeddings
from .types import ChecklistItem


def checklist_item_module_key(module_sheet_name: str) -> str:
    """
    Convert checklist sheet name like "Module 1" into short folder key "m1".
    """
    m = re.search(r"(\d+)", module_sheet_name)
    if not m:
        raise ValueError(f"Unexpected module sheet name: {module_sheet_name}")
    return f"m{int(m.group(1))}"


def sha256_file(path: str | Path) -> str:
    path = Path(path)
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _index_marker_path(persist_directory: Path) -> Path:
    return persist_directory / "index_marker.json"


def should_rebuild_index(persist_directory: Path, *, checklist_xlsx_hash: str, embed_model: str) -> bool:
    marker_path = _index_marker_path(persist_directory)
    if not persist_directory.exists() or not marker_path.exists():
        return True
    try:
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
    except Exception:
        return True
    return payload.get("checklist_xlsx_sha256") != checklist_xlsx_hash or payload.get("embed_model") != embed_model


def build_or_load_chroma_for_checklist(
    *,
    checklist_xlsx: str | Path,
    persist_directory: str | Path,
    embed_model: str,
    hf_token: str | None = None,
    collection_name: str = "ctd_checklist_items",
) -> tuple[Chroma, dict[str, ChecklistItem]]:
    """
    Creates a persistent Chroma vector index of checklist items.

    Returns:
      - vectorstore (Chroma)
      - id_map where id = "{module}:{section_id}" -> ChecklistItem
    """
    persist_directory = Path(persist_directory)
    persist_directory.mkdir(parents=True, exist_ok=True)

    checklist_xlsx = Path(checklist_xlsx)
    checklist_xlsx_hash = sha256_file(checklist_xlsx)

    if should_rebuild_index(
        persist_directory, checklist_xlsx_hash=checklist_xlsx_hash, embed_model=embed_model
    ):
        # Remove old content (safe because it's only our derived index)
        import shutil
        shutil.rmtree(persist_directory, ignore_errors=True)
        persist_directory.mkdir(parents=True, exist_ok=True)

    embeddings = LocalAllMiniLMEmbeddings(model_name_or_path=embed_model, hf_token=hf_token)

    try:
        # Use cosine space so that Chroma score is cosine distance.
        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(persist_directory),
            collection_metadata={"hnsw:space": "cosine"},
        )
    except Exception as e:
        # If instantiation fails (e.g., KeyError: '_type' due to incompatible persistence format),
        # wipe the directory and retry once with a unique directory name if still failing.
        import shutil
        import time
        import random

        shutil.rmtree(persist_directory, ignore_errors=True)
        time.sleep(0.5)  # Give OS time to release locks
        persist_directory.mkdir(parents=True, exist_ok=True)
        
        try:
            vectorstore = Chroma(
                collection_name=collection_name,
                embedding_function=embeddings,
                persist_directory=str(persist_directory),
                collection_metadata={"hnsw:space": "cosine"},
            )
        except Exception:
            # Last resort: use a fresh directory if the default one is stuck/locked
            fresh_dir = persist_directory.parent / f"{persist_directory.name}_recovery_{int(time.time())}_{random.randint(1000, 9999)}"
            fresh_dir.mkdir(parents=True, exist_ok=True)
            vectorstore = Chroma(
                collection_name=collection_name,
                embedding_function=embeddings,
                persist_directory=str(fresh_dir),
                collection_metadata={"hnsw:space": "cosine"},
            )

    # If index already exists, we'll just return it (and id_map is derived from checklist content).
    from .checklist import load_checklist_items

    checklist_items = load_checklist_items(checklist_xlsx)
    id_map: dict[str, ChecklistItem] = {}

    def item_id(module_key: str, section_id: str) -> str:
        return f"{module_key}:{section_id}"

    docs: list[Document] = []
    for it in checklist_items:
        module_key = checklist_item_module_key(it.module)
        cid = item_id(module_key, it.section_id)
        id_map[cid] = it
        docs.append(
            Document(
                page_content=f"{it.title}\n{it.description}",
                metadata={
                    "module": module_key,
                    "section_id": it.section_id,
                    "applicability": it.applicability,
                    "title": it.title,
                    "id": cid,
                },
            )
        )

    # Upsert all docs (id-based). Chroma will reuse already present vectors.
    ids = [d.metadata["id"] for d in docs]
    if docs:
        vectorstore.add_documents(docs, ids=ids)

    marker_payload = {"checklist_xlsx_sha256": checklist_xlsx_hash, "embed_model": embed_model}
    _index_marker_path(persist_directory).write_text(json.dumps(marker_payload), encoding="utf-8")
    return vectorstore, id_map

