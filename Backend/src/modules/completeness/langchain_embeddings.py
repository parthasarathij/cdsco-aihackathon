from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from typing import Iterable, List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer
import os

from langchain_core.embeddings import Embeddings


class LocalAllMiniLMEmbeddings(Embeddings):
    """
    LangChain-compatible embeddings using local `sentence-transformers`.

    - Supports optional HF token for private model downloads.
    - Normalizes embeddings so cosine similarity matches Chroma's cosine space.
    """

    def __init__(
        self,
        model_name_or_path: str = "sentence-transformers/all-MiniLM-L6-v2",
        *,
        hf_token: str | None = None,
    ):
        if hf_token is None:
            hf_token = os.environ.get("HF_TOKEN") or os.environ.get("hf_token")
        kwargs = {}
        if hf_token:
            # sentence-transformers forwards to HuggingFace Hub
            kwargs["use_auth_token"] = hf_token

        self._model = SentenceTransformer(model_name_or_path, **kwargs)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        emb = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(emb, dtype=np.float32).tolist()

    def embed_query(self, text: str) -> List[float]:
        emb = self._model.encode(
            [text],
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        return np.asarray(emb, dtype=np.float32).tolist()

