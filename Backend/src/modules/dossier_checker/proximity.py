from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re
from typing import Iterable

from ..constants.dossier_field_maps import FIELD_ANCHORS, PROXIMITY_CHARS


def _iter_anchor_matches(patterns: Iterable[str], text: str) -> list[re.Match[str]]:
    matches: list[re.Match[str]] = []
    for pat in patterns:
        try:
            matches.extend(re.finditer(pat, text, flags=re.IGNORECASE | re.MULTILINE))
        except re.error:
            continue
    matches.sort(key=lambda x: x.start())
    return matches


def collect_snippets_for_field(field_num: int, full_text: str) -> str:
    """
    Collect up to ~2000 chars of context near regulatory anchors for this field.
    """
    anchors = FIELD_ANCHORS.get(field_num, ())
    if not anchors or not full_text:
        return ""
    ms = _iter_anchor_matches(anchors, full_text)
    if not ms:
        return ""
    chunks: list[str] = []
    seen: set[tuple[int, int]] = set()
    for m in ms[:25]:
        start = max(0, m.start())
        end = min(len(full_text), m.end() + PROXIMITY_CHARS)
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)
        chunks.append(full_text[start:end])
    return "\n---\n".join(chunks)[:8000]


def extract_lineish_value(snippet: str) -> str:
    """Take first substantial line after anchor-ish prefix."""
    if not snippet:
        return ""
    lines = [ln.strip() for ln in snippet.splitlines() if ln.strip()]
    for ln in lines[:12]:
        if len(ln) < 3:
            continue
        if re.match(r"^(section|table|figure)\b", ln, re.I):
            continue
        return ln[:500]
    return (snippet[:500]).strip()
