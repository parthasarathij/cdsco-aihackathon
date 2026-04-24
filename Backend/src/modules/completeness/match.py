from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from dataclasses import asdict
from pathlib import Path

import numpy as np

from .checklist import load_checklist_items, MODULE_SHEETS
from .embed import DEFAULT_EMBED_MODEL, embed_texts, load_or_build_checklist_embeddings
from .extract import extract_text_first_pages
from .types import DocumentMatch


def _list_docs(module_dir: Path) -> list[Path]:
    if not module_dir.exists() or not module_dir.is_dir():
        return []
    out: list[Path] = []
    for p in module_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in {".pdf", ".docx"}:
            out.append(p)
    return sorted(out)


def check_folder_against_checklist(
    *,
    checklist_xlsx: str | Path,
    dossier_folder: str | Path,
    embed_model: str = DEFAULT_EMBED_MODEL,
    enable_llm_review: bool = False,
    llm_model_path: str | None = None,
    llm_review_only_for_mandatory: bool = True,
    llm_review_max_chars: int = 2000,
    strict_threshold: float = 0.78,
    partial_threshold: float = 0.65,
    max_pdf_pages: int = 3,
    max_docx_chars: int = 18_000,
) -> dict:
    """
    Returns a JSON-serializable dict.

    Folder layout expectation:
      dossier_folder/
        Module 1/
        Module 2/
        ...

    (Subfolder depth inside each module folder is allowed.)
    """
    checklist_items = load_checklist_items(checklist_xlsx)
    emb_all, items_all = load_or_build_checklist_embeddings(checklist_items, model_name_or_path=embed_model)
    reviewer = None
    if enable_llm_review:
        from .llm_review import LocalLlamaReviewer

        reviewer = LocalLlamaReviewer(llm_model_path or "Llama-3.2-3B-Instruct")

    dossier_folder = Path(dossier_folder)
    results: dict[str, list[DocumentMatch]] = {}
    extras_by_module: dict[str, list[str]] = {}

    # Pre-index embeddings by module
    idx_by_module: dict[str, list[int]] = {m: [] for m in MODULE_SHEETS}
    for i, it in enumerate(items_all):
        idx_by_module.setdefault(it.module, []).append(i)

    for module in MODULE_SHEETS:
        module_dir = dossier_folder / module
        files = _list_docs(module_dir)
        extras_by_module[module] = [str(p.relative_to(dossier_folder)) for p in files]

        module_item_indices = idx_by_module.get(module, [])
        module_items = [items_all[i] for i in module_item_indices]
        module_item_emb = emb_all[module_item_indices] if module_item_indices else np.zeros((0, 1), dtype=np.float32)

        if not module_items:
            results[module] = []
            continue

        # Extract and embed docs for this module
        doc_texts: list[str] = []
        for p in files:
            try:
                doc_texts.append(
                    extract_text_first_pages(p, max_pdf_pages=max_pdf_pages, max_docx_chars=max_docx_chars)
                )
            except Exception:
                doc_texts.append("")

        doc_emb = embed_texts(doc_texts, model_name_or_path=embed_model) if files else np.zeros((0, module_item_emb.shape[1]), dtype=np.float32)

        # score matrix (items x docs) using dot product (normalized embeddings)
        scores = (module_item_emb @ doc_emb.T) if (module_item_emb.size and doc_emb.size) else np.zeros((len(module_items), len(files)), dtype=np.float32)

        used_docs: set[int] = set()
        module_matches: list[DocumentMatch] = []

        for item_idx, item in enumerate(module_items):
            best_doc = None
            best_score = 0.0
            if len(files) > 0:
                for j in range(len(files)):
                    if j in used_docs:
                        continue
                    s = float(scores[item_idx, j])
                    if s > best_score:
                        best_score = s
                        best_doc = j

            if best_doc is None or best_score < partial_threshold:
                status = "missing"
                matched_file = None
                score = best_score
                llm_reason = None
            elif best_score >= strict_threshold:
                status = "matched"
                matched_file = str(files[best_doc].relative_to(dossier_folder))
                score = best_score
                used_docs.add(best_doc)
                llm_reason = None
            else:
                status = "needs_user_confirmation"
                matched_file = str(files[best_doc].relative_to(dossier_folder))
                score = best_score
                used_docs.add(best_doc)
                llm_reason = None

                if reviewer is not None:
                    if (not llm_review_only_for_mandatory) or (item.applicability == "Mandatory"):
                        snippet = (doc_texts[best_doc] or "")[:llm_review_max_chars]
                        verdict = reviewer.review(
                            checklist_title=item.title,
                            checklist_description=item.description,
                            document_text_snippet=snippet,
                        )
                        llm_reason = verdict.reason
                        if verdict.verdict == "matched":
                            status = "matched"
                        elif verdict.verdict == "not_a_match":
                            status = "missing"
                            matched_file = None

            module_matches.append(
                DocumentMatch(
                    module=module,
                    checklist_section_id=item.section_id,
                    checklist_title=item.title,
                    checklist_description=item.description,
                    applicability=item.applicability,
                    status=status,  # type: ignore[arg-type]
                    score=float(score),
                    matched_file=matched_file,
                    llm_reason=llm_reason,
                )
            )

        # Remove matched/partial files from extras list
        matched_files = {m.matched_file for m in module_matches if m.matched_file}
        extras_by_module[module] = [f for f in extras_by_module[module] if f not in matched_files]
        results[module] = module_matches

    # Build final JSON
    out = {
        "checklist_file": str(Path(checklist_xlsx)),
        "dossier_folder": str(dossier_folder),
        "thresholds": {"strict": strict_threshold, "partial": partial_threshold},
        "modules": {},
    }

    for module, matches in results.items():
        out["modules"][module] = {
            "items": [asdict(m) for m in matches],
            "extras_unmatched_files": extras_by_module.get(module, []),
        }
        # Convenience: show missing mandatory items
        out["modules"][module]["missing_mandatory"] = [
            asdict(m) for m in matches if m.applicability == "Mandatory" and m.status == "missing"
        ]

    return out

