from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re


def _tokenize(value: str) -> set[str]:
    return {t for t in re.findall(r"[a-zA-Z0-9]+", (value or "").lower()) if len(t) > 2}


def check_document_relevance(
    *,
    checklist_title: str,
    extracted_text: str,
    model_name: str | None = None,
) -> str:
    """
    Lightweight local relevance check.

    Kept deterministic and offline so the endpoint remains usable even when LLM
    credentials are not configured.
    """
    del model_name  # reserved for future LLM-based implementation

    title_tokens = _tokenize(checklist_title)
    text_tokens = _tokenize(extracted_text)
    if not title_tokens or not text_tokens:
        return "not_relevant"

    overlap = len(title_tokens.intersection(text_tokens))
    ratio = overlap / max(len(title_tokens), 1)
    return "relevant" if ratio >= 0.35 else "not_relevant"
