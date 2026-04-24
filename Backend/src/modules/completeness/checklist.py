from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re
from pathlib import Path
from typing import Iterable

import pandas as pd

from .types import ChecklistItem


MODULE_SHEETS = ["Module 1", "Module 2", "Module 3", "Module 4", "Module 5"]
_APPLICABILITY_VALUES = {"mandatory": "Mandatory", "conditional": "Conditional", "optional": "Optional"}


def _find_header_row(df: pd.DataFrame) -> int:
    """
    Module sheets are messy (merged cells, "Unnamed" columns).
    We locate the row that contains "Section ID" and "Document Title" keywords.
    """
    for i in range(len(df)):
        row = " ".join(str(x) for x in df.iloc[i].tolist())
        if "Section ID" in row and "Document Title" in row:
            return i
    raise ValueError("Could not locate header row (expected 'Section ID' and 'Document Title').")


def _clean_cell(x) -> str:
    if x is None:
        return ""
    if isinstance(x, float) and pd.isna(x):
        return ""
    s = str(x).replace("\n", " ").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def load_checklist_items(xlsx_path: str | Path) -> list[ChecklistItem]:
    xlsx_path = Path(xlsx_path)
    if not xlsx_path.exists():
        raise FileNotFoundError(str(xlsx_path))

    items: list[ChecklistItem] = []
    for sheet in MODULE_SHEETS:
        raw = pd.read_excel(xlsx_path, sheet_name=sheet, header=None)
        header_row = _find_header_row(raw)
        df = pd.read_excel(xlsx_path, sheet_name=sheet, header=header_row)

        # Best-effort: identify the actual columns by keyword match.
        colmap: dict[str, str] = {}
        for c in df.columns:
            key = _clean_cell(c).lower()
            if "section id" in key:
                colmap["section_id"] = c
            elif "document title" in key:
                colmap["title"] = c
            elif "document description" in key:
                colmap["description"] = c
            elif "applicability" in key:
                colmap["applicability"] = c

        missing = {"section_id", "title", "description", "applicability"} - set(colmap)
        if missing:
            raise ValueError(f"{sheet}: missing expected columns: {sorted(missing)}")

        for _, row in df.iterrows():
            section_id = _clean_cell(row[colmap["section_id"]])
            title = _clean_cell(row[colmap["title"]])
            description = _clean_cell(row[colmap["description"]])
            applicability_raw = _clean_cell(row[colmap["applicability"]]).lower()

            if not section_id and not title and not description:
                continue
            if "total documents" in f"{section_id} {title} {description}".lower():
                break

            # Normalize applicability
            applicability = _APPLICABILITY_VALUES.get(applicability_raw, "")
            if not applicability:
                # some rows have applicability blank (merged cell artifacts); skip
                continue

            items.append(
                ChecklistItem(
                    module=sheet,
                    section_id=section_id,
                    title=title,
                    description=description,
                    applicability=applicability,  # type: ignore[arg-type]
                )
            )

    return items


def group_by_module(items: Iterable[ChecklistItem]) -> dict[str, list[ChecklistItem]]:
    out: dict[str, list[ChecklistItem]] = {}
    for it in items:
        out.setdefault(it.module, []).append(it)
    return out

