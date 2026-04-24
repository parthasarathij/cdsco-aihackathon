from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re
from dataclasses import asdict
from pathlib import Path
from typing import Optional
import math

from .checklist import load_checklist_items
from .chroma_store import build_or_load_chroma_for_checklist, checklist_item_module_key
from .extract import extract_text_first_pages
from .llm_describer import LocalLlamaDescriber, build_query_text
from .types import DocumentMatch, MatchStatus

DEFAULT_STRICT_SIMILARITY = 0.62
DEFAULT_PARTIAL_GAP = 0.10


def _list_docs(module_dir: Path) -> list[Path]:
    if not module_dir.exists() or not module_dir.is_dir():
        return []
    out: list[Path] = []
    for p in module_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in {".pdf", ".docx"}:
            out.append(p)
    return sorted(out)


def _detect_module_dirs(dossier_folder: Path, expected_module_keys: list[str]) -> dict[str, Path]:
    """
    Accept module folder names (case-insensitive):
    - m1, m2 ...
    - Module 1, Module-1
    Output keys are always lower-case `m{n}`.
    """
    out: dict[str, Path] = {}
    if not dossier_folder.exists() or not dossier_folder.is_dir():
        return out

    # If dossier root itself is a module folder (e.g., uploaded ZIP contains only "m2")
    root_name = dossier_folder.name.strip().lower()
    m = re.match(r"^m(\d+)$", root_name)
    if m:
        key = f"m{int(m.group(1))}"
        if key in expected_module_keys:
            out[key] = dossier_folder
            return out

    m = re.search(r"(^|[^a-z0-9])m(\d+)([^a-z0-9]|$)", root_name)
    if m:
        key = f"m{int(m.group(2))}"
        if key in expected_module_keys:
            out[key] = dossier_folder
            return out

    m = re.search(r"module[\s_-]*(\d+)", root_name)
    if m:
        key = f"m{int(m.group(1))}"
        if key in expected_module_keys:
            out[key] = dossier_folder
            return out

    for sub in dossier_folder.iterdir():
        if not sub.is_dir():
            continue
        name = sub.name.strip().lower()

        m = re.match(r"^m(\d+)$", name)
        if m:
            key = f"m{int(m.group(1))}"
            if key in expected_module_keys:
                out[key] = sub
                continue

        # Allow prefixes/suffixes like "1.m1" / "folder-m1" / "m1_module"
        m = re.search(r"(^|[^a-z0-9])m(\d+)([^a-z0-9]|$)", name)
        if m:
            key = f"m{int(m.group(2))}"
            if key in expected_module_keys:
                out[key] = sub
                continue

        m = re.search(r"module[\s_-]*(\d+)", name)
        if m:
            key = f"m{int(m.group(1))}"
            if key in expected_module_keys:
                out[key] = sub

    return out


def _score_to_similarity(score: float, *, metric: str) -> float:
    """
    For Chroma with collection_metadata {"hnsw:space": "cosine"},
    returned score is cosine distance (smaller => more similar).
    similarity = 1 - cosine_distance
    """
    if metric == "cosine":
        return 1.0 - float(score)
    return float(score)


def _decide_status(*, similarity: float, strict_threshold: float, partial_gap: float) -> MatchStatus:
    partial_min = strict_threshold - partial_gap
    if similarity >= strict_threshold:
        return "matched"
    if similarity >= partial_min:
        return "needs_user_confirmation"
    return "missing"


def section_id_boost(filename: str, top_matches: list[dict], boost: float = 0.20) -> list[dict]:
    pattern = r"\b(\d+\.\d+(?:\.[A-Z]+)?(?:\.\d+)*)\b"
    matches_in_name = re.findall(pattern, filename, re.IGNORECASE)
    if not matches_in_name:
        return top_matches
    boosted: list[dict] = []
    for m in top_matches:
        item = dict(m)
        section = str(item.get("checklist_section_id", ""))
        for hint in matches_in_name:
            if section == hint or section.startswith(hint) or hint.startswith(section):
                item["similarity"] = min(1.0, float(item.get("similarity", 0.0)) + boost)
                item["boost_applied"] = f"filename_hint:{hint}"
                break
        boosted.append(item)
    return boosted


def apply_nomination_boost(
    checklist_item_id: str,
    best_score: float,
    file_debug: list[dict],
    boost: float = 0.12,
    min_nominations: int = 2,
) -> tuple[float, int]:
    nomination_count = sum(
        1
        for f in file_debug
        if any(
            m.get("checklist_section_id") == checklist_item_id
            for m in f.get("top_matches", [])[:3]
        )
    )
    if nomination_count >= min_nominations:
        best_score = min(1.0, best_score + boost)
    return best_score, nomination_count


def secondary_match_fallback(
    missing_items: list[DocumentMatch],
    file_debug: list[dict],
    fallback_threshold: float = 0.48,
) -> list[DocumentMatch]:
    recovered: list[DocumentMatch] = []
    for item in missing_items:
        item_id = item.checklist_section_id
        best_secondary_score = 0.0
        best_secondary_file = None
        for f in file_debug:
            for m in f.get("top_matches", [])[1:3]:
                if m.get("checklist_section_id") == item_id:
                    similarity = float(m.get("similarity", 0.0))
                    if similarity > best_secondary_score:
                        best_secondary_score = similarity
                        best_secondary_file = f.get("file")
        if best_secondary_score >= fallback_threshold:
            recovered.append(
                DocumentMatch(
                    module=item.module,
                    checklist_section_id=item.checklist_section_id,
                    checklist_title=item.checklist_title,
                    checklist_description=item.checklist_description,
                    applicability=item.applicability,
                    status="needs_user_confirmation",
                    score=best_secondary_score,
                    matched_file=best_secondary_file,
                    llm_reason=item.llm_reason,
                    boost_applied=item.boost_applied,
                    nomination_count=item.nomination_count,
                    match_method="secondary_fallback",
                    clarity_score=item.clarity_score,
                )
            )
    return recovered


def apply_ambiguity_penalty(top_matches: list[dict], raw_score: float) -> tuple[float, float | None]:
    if len(top_matches) < 2:
        return raw_score, None
    clarity = float(top_matches[0].get("similarity", 0.0)) - float(top_matches[1].get("similarity", 0.0))
    if clarity < 0.08:
        return raw_score * 0.88, clarity
    return raw_score, clarity


def _infer_section_id_from_filename(path: Path) -> str | None:
    name = path.stem
    m = re.search(r"(\d+(?:\.\d+){1,3}(?:\.[SP])?)", name, flags=re.IGNORECASE)
    if not m:
        return None
    return m.group(1)


def check_folder_against_checklist(
    *,
    checklist_xlsx: str | Path,
    dossier_folder: str | Path,
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2",
    hf_token: Optional[str] = None,
    chroma_persist_directory: str | Path = ".chroma_ctd_checklist",
    chroma_collection_name: str = "ctd_checklist_items",
    strict_threshold: float = DEFAULT_STRICT_SIMILARITY,
    partial_gap: float = DEFAULT_PARTIAL_GAP,
    max_pdf_pages: int = 3,
    max_docx_chars: int = 18_000,
    enable_llm_descriptions: bool = True,
    llm_model_path: str = "gpt-4o-mini",
    llm_max_new_tokens: int = 220,
    llm_snippet_max_chars: int = 6000,
    include_file_level_debug: bool = True,
    debug_snippet_preview_chars: int = 1200,
    debug_top_k: int = 5,
) -> dict:
    """
    JSON output:
      - Evaluate Mandatory first (high priority)
      - Conditional/Optional are still evaluated, but shown as low priority if Mandatory is incomplete (option B)
    """
    expected_module_keys = ["m1", "m2", "m3", "m4", "m5"]
    dossier_folder = Path(dossier_folder)

    checklist_items = load_checklist_items(checklist_xlsx)

    # Build/load Chroma index (checklist vectors)
    vectorstore, id_map = build_or_load_chroma_for_checklist(
        checklist_xlsx=checklist_xlsx,
        persist_directory=chroma_persist_directory,
        embed_model=embed_model,
        hf_token=hf_token,
        collection_name=chroma_collection_name,
    )

    module_dirs = _detect_module_dirs(dossier_folder, expected_module_keys)

    describer: Optional[LocalLlamaDescriber] = None
    llm_init_error: str | None = None
    if enable_llm_descriptions:
        try:
            describer = LocalLlamaDescriber(
                llm_model_path,
                max_new_tokens=llm_max_new_tokens,
                snippet_max_chars=llm_snippet_max_chars,
            )
        except Exception as e:
            # If LLM can't start (version mismatch, slow load, etc.), degrade gracefully.
            describer = None
            llm_init_error = f"{type(e).__name__}: {repr(e)}"

    # Prepare checklist items per module key
    items_by_module: dict[str, list[str]] = {k: [] for k in expected_module_keys}
    for it in checklist_items:
        module_key = checklist_item_module_key(it.module)  # "Module 1" -> "m1"
        cid = f"{module_key}:{it.section_id}"
        items_by_module[module_key].append(cid)

    module_reports: dict[str, dict] = {}
    modules_to_process = list(module_dirs.keys()) if module_dirs else expected_module_keys

    for module_key in modules_to_process:
        module_items_ids = items_by_module.get(module_key, [])
        module_items = [id_map[cid] for cid in module_items_ids if cid in id_map]

        module_dir = module_dirs.get(module_key, Path("__missing__"))
        uploaded_files = _list_docs(module_dir)
        uploaded_files_rel: list[str] = [str(p.relative_to(dossier_folder)) for p in uploaded_files]
        file_level_debug: list[dict] = []
        nomination_debug: list[dict] = []

        # Keep best similarity per checklist item across uploaded documents
        # Initialize with a finite low score so JSON serialization never sees -inf/nan.
        best_by_item: dict[str, dict] = {
            cid: {"similarity": 0.0, "matched_file": None, "boost_applied": None, "clarity_score": None}
            for cid in module_items_ids
        }

        for p, p_rel in zip(uploaded_files, uploaded_files_rel):
            try:
                snippet = extract_text_first_pages(
                    p,
                    section_id=_infer_section_id_from_filename(p),
                    max_pdf_pages=max_pdf_pages,
                    max_docx_chars=max_docx_chars,
                )
            except Exception:
                snippet = ""
            if not snippet.strip():
                continue

            k = max(1, len(module_items_ids))
            # Query checklist items for this module using:
            # - LLM description (recommended, structured + checklist-aligned)
            # - fallback to raw snippet if describer disabled
            llm_description_struct: dict | None = None
            llm_description_text: str | None = None
            llm_description_error: str | None = None
            if describer is not None:
                try:
                    desc = describer.describe(snippet_text=snippet)
                    llm_description_struct = desc.to_dict()
                    query_text = build_query_text(llm_description_struct)
                    llm_description_text = query_text
                except Exception as e:
                    query_text = snippet
                    llm_description_error = (
                        f"describe_failed_fallback_to_raw_snippet: "
                        f"{type(e).__name__}: {repr(e)}"
                    )
            else:
                query_text = snippet
                if enable_llm_descriptions and llm_init_error:
                    llm_description_error = f"llm_unavailable: {llm_init_error}"

            results = vectorstore.similarity_search_with_score(
                query_text, k=k, filter={"module": module_key}
            )
            top_matches_all: list[dict] = []
            for d, s in results:
                meta = d.metadata or {}
                top_matches_all.append(
                    {
                        "checklist_id": meta.get("id"),
                        "checklist_section_id": meta.get("section_id"),
                        "checklist_title": meta.get("title"),
                        "applicability": meta.get("applicability"),
                        "similarity": _score_to_similarity(s, metric="cosine"),
                    }
                )
            top_matches_all = section_id_boost(p.name, top_matches_all)
            nomination_debug.append({"file": p_rel, "top_matches": top_matches_all[:3]})

            if include_file_level_debug:
                top_matches = top_matches_all[: max(1, debug_top_k)]

                file_level_debug.append(
                    {
                        "file": p_rel,
                        "extracted_text_preview": snippet[:debug_snippet_preview_chars],
                        "llm_description": llm_description_struct,
                        "llm_description_text": llm_description_text,
                        "llm_description_error": llm_description_error,
                        "query_used_for_embedding": query_text[:debug_snippet_preview_chars],
                        "top_matches": top_matches,
                    }
                )

            clarity_score = None
            if len(top_matches_all) >= 2:
                clarity_score = float(top_matches_all[0].get("similarity", 0.0)) - float(
                    top_matches_all[1].get("similarity", 0.0)
                )
            for match in top_matches_all:
                cid = match.get("checklist_id")
                if not cid or cid not in best_by_item:
                    continue
                similarity = float(match.get("similarity", 0.0))
                if similarity > best_by_item[cid]["similarity"]:
                    best_by_item[cid]["similarity"] = similarity
                    best_by_item[cid]["matched_file"] = p_rel
                    best_by_item[cid]["boost_applied"] = match.get("boost_applied")
                    best_by_item[cid]["clarity_score"] = clarity_score

        # Build per-item outputs
        items_out: list[DocumentMatch] = []
        missing_mandatory: list[DocumentMatch] = []

        for it in module_items:
            cid = f"{module_key}:{it.section_id}"
            best = best_by_item.get(
                cid, {"similarity": float("-inf"), "matched_file": None, "boost_applied": None, "clarity_score": None}
            )
            similarity_raw = best.get("similarity", 0.0)
            similarity = float(similarity_raw)
            if not math.isfinite(similarity):
                similarity = 0.0
            matched_file = best.get("matched_file")
            boost_applied = best.get("boost_applied")
            clarity_score = best.get("clarity_score")
            matching_file_top = next((f.get("top_matches", []) for f in nomination_debug if f.get("file") == matched_file), [])
            similarity, clarity_score_from_penalty = apply_ambiguity_penalty(matching_file_top, similarity)
            if clarity_score_from_penalty is not None:
                clarity_score = clarity_score_from_penalty
            similarity, nomination_count = apply_nomination_boost(it.section_id, similarity, nomination_debug)

            status = _decide_status(
                similarity=similarity,
                strict_threshold=strict_threshold,
                partial_gap=partial_gap,
            )

            dm = DocumentMatch(
                module=module_key,
                checklist_section_id=it.section_id,
                checklist_title=it.title,
                checklist_description=it.description,
                applicability=it.applicability,
                status=status,
                score=similarity,
                matched_file=matched_file if status != "missing" else None,
                llm_reason=None,
                boost_applied=boost_applied,
                nomination_count=nomination_count,
                match_method="primary",
                clarity_score=clarity_score,
            )
            items_out.append(dm)

        recovered = secondary_match_fallback(
            missing_items=[m for m in items_out if m.status == "missing"],
            file_debug=nomination_debug,
            fallback_threshold=0.48,
        )
        recovered_by_id = {m.checklist_section_id: m for m in recovered}
        if recovered_by_id:
            items_out = [recovered_by_id.get(m.checklist_section_id, m) for m in items_out]

        for m in items_out:
            if m.applicability == "Mandatory" and m.status == "missing":
                missing_mandatory.append(m)

        mandatory_complete = len(missing_mandatory) == 0
        matched_files = {m.matched_file for m in items_out if m.matched_file}
        extras_unmatched_files = [f for f in uploaded_files_rel if f not in matched_files]

        conditional_optional_needs_review = [
            m
            for m in items_out
            if m.applicability in {"Conditional", "Optional"} and m.status != "matched"
        ]

        review_note = (
            "Mandatory items are complete. Conditional/Optional findings should be verified by the reviewer."
            if mandatory_complete
            else "Mandatory items are missing; Conditional/Optional findings are evaluated but treated as low priority until Mandatory is complete (option B)."
        )

        module_reports[module_key] = {
            "items": [asdict(m) for m in items_out],
            "mandatory_complete": mandatory_complete,
            "missing_mandatory": [asdict(m) for m in missing_mandatory],
            "conditional_optional_needs_reviewer_review": [asdict(m) for m in conditional_optional_needs_review],
            "conditional_optional_review_note": review_note,
            "extras_unmatched_files": extras_unmatched_files,
        }
        if include_file_level_debug:
            module_reports[module_key]["file_level_debug"] = file_level_debug
            module_reports[module_key]["llm_debug"] = {
                "enable_llm_descriptions": enable_llm_descriptions,
                "llm_initialized": describer is not None,
                "llm_model_path": llm_model_path,
                "llm_init_error": llm_init_error,
            }

    return {
        "checklist_file": str(Path(checklist_xlsx)),
        "dossier_folder": str(dossier_folder),
        "thresholds": {"strict_similarity": strict_threshold, "partial_gap": partial_gap},
        "modules": module_reports,
    }

