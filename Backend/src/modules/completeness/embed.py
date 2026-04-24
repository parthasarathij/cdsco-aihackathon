from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

import numpy as np
from sentence_transformers import SentenceTransformer

from .types import ChecklistItem


DEFAULT_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def _cache_dir() -> Path:
    d = Path(".cache")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _items_fingerprint(items: list[ChecklistItem]) -> str:
    # stable fingerprint to invalidate cache if checklist changes
    payload = [asdict(i) for i in items]
    return str(hash(json.dumps(payload, sort_keys=True, ensure_ascii=False)))


def embed_texts(texts: Iterable[str], *, model_name_or_path: str = DEFAULT_EMBED_MODEL) -> np.ndarray:
    model = SentenceTransformer(model_name_or_path)
    emb = model.encode(list(texts), normalize_embeddings=True, show_progress_bar=False)
    return np.asarray(emb, dtype=np.float32)


def load_or_build_checklist_embeddings(
    items: list[ChecklistItem], *, model_name_or_path: str = DEFAULT_EMBED_MODEL
) -> tuple[np.ndarray, list[ChecklistItem]]:
    """
    Returns (embeddings, items) where embeddings[i] corresponds to items[i].
    """
    fp = _items_fingerprint(items)
    cache_path = _cache_dir() / f"checklist_embeddings_{fp}.npz"

    if cache_path.exists():
        data = np.load(str(cache_path))
        return data["emb"], items

    texts = [f"{it.title}\n{it.description}" for it in items]
    emb = embed_texts(texts, model_name_or_path=model_name_or_path)
    np.savez_compressed(str(cache_path), emb=emb)
    return emb, items

