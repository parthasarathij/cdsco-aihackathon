from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from typing import Any

from ..utils import dossier_normalizer as norm
from .proximity import collect_snippets_for_field, extract_lineish_value


def run_consistency_from_module_texts(full_text_by_mod: dict[str, str]) -> dict[str, Any]:
    """
    Extract → normalize → compare pipeline given already-aggregated text per module (M1…M5).

    ``full_text_by_mod`` keys should be like ``M1``, ``M2`` (only modules present in the zip).
    """
    labels = [m for m in ("M1", "M2", "M3", "M4", "M5") if m in full_text_by_mod]
    if not labels:
        raise ValueError("No module folders (m1–m5) with text were found.")

    raw_field_by_mod: dict[int, dict[str, str]] = {i: {} for i in range(1, 11)}

    for mod in labels:
        text = full_text_by_mod.get(mod, "") or ""
        for fn in range(1, 11):
            snip = collect_snippets_for_field(fn, text)
            raw_field_by_mod[fn][mod] = extract_lineish_value(snip) if snip else ""

    norm_by_field_mod: dict[int, dict[str, norm.NormalizedFieldValue]] = {i: {} for i in range(1, 11)}
    for fn in range(1, 11):
        for mod in labels:
            raw = raw_field_by_mod[fn].get(mod, "")
            if not raw.strip():
                norm_by_field_mod[fn][mod] = norm.NormalizedFieldValue(display="Not found", canonical="")
            else:
                norm_by_field_mod[fn][mod] = norm.normalize_for_field(fn, raw)

    stability_lt_by_mod: dict[str, int | None] = {
        m: norm_by_field_mod[8][m].months_lt for m in labels
    }

    comparisons: list[dict[str, Any]] = []
    for fn in range(1, 11):
        by_mod = norm_by_field_mod[fn]
        raw_by = raw_field_by_mod[fn]
        res, canon, notes = norm.compare_field_across_modules(fn, by_mod, raw_by)
        if fn == 9:
            res, canon, notes = norm.refine_shelf_life_result(
                res, canon, notes, by_mod, stability_lt_by_mod
            )
        if fn == 10:
            res, canon, notes = norm.refine_be_m2_m5(res, canon, notes, by_mod)

        values_by_module = {m: (raw_by.get(m) or "").strip() or "Not found" for m in labels}
        normalized_values = {m: by_mod[m].display for m in labels}

        comparisons.append(
            {
                "fieldNumber": fn,
                "fieldName": norm.FIELD_NAMES[fn],
                "result": res,
                "valuesByModule": values_by_module,
                "normalizedValues": normalized_values,
                "canonicalGroup": canon,
                "notes": notes,
            }
        )

    return {
        "comparisons": comparisons,
        "uploadedModules": labels,
    }


def run_consistency_check(
    modules_in_order: list[tuple[str, bytes, str]],
) -> dict[str, Any]:
    """
    Legacy path: one uploaded file per module (label, bytes, filename).
    """
    from .text_io import extract_text_from_upload

    texts: dict[str, str] = {
        mod: extract_text_from_upload(fname, data) 
        for mod, data, fname in modules_in_order
    }
    return run_consistency_from_module_texts(texts)
