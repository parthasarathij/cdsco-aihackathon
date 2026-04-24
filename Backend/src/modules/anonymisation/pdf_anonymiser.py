from __future__ import annotations
from src.utils.logger import get_logger

from dataclasses import dataclass, field
from typing import Any, Optional

import io
import logging
import os
import uuid
from datetime import datetime

import fitz  

from .anonymizer import DocumentAnonymiser, _generaliser_for_entity_type
from .detector import EntityDetector, is_token_isolated
from .models import DetectedEntity, MappingEntry, MappingTableResponse
from .mapping_export import export_mapping_to_excel

logger = get_logger(__name__)


@dataclass
class PdfAnonymisationResult:
    pseudo_pdf_bytes:    Optional[bytes] = None
    full_anon_pdf_bytes: Optional[bytes] = None
    combined_json:       dict            = field(default_factory=dict)


def _page_words(page: fitz.Page) -> list[dict[str, Any]]:
    """
    Return list of words with rectangles using page.get_text("words").
    Each item has: text, rect, block, line, word, page.
    """
    out: list[dict[str, Any]] = []
    # (x0, y0, x1, y1, "word", block_no, line_no, word_no)
    for x0, y0, x1, y1, w, b, l, wn in page.get_text("words"):
        ww = (w or "").strip()
        if not ww:
            continue
        out.append(
            {
                "text": ww,
                "rect": fitz.Rect(x0, y0, x1, y1),
                "block": int(b),
                "line": int(l),
                "word": int(wn),
            }
        )
    return out


def _build_text_stream(doc: fitz.Document) -> tuple[str, list[dict[str, Any]]]:
    """
    Build a structured text stream for detection and a char-span map back to words.
    Instead of trusting PDF internal line metadata, we reconstruct rows by y-position
    and insert tab separators on wider x gaps (table/column-friendly).

    Returns
    -------
    full_text: str
    word_spans: list of dicts: {page_index, word_index, start, end, rect, text}
    """
    pieces: list[str] = []
    spans: list[dict[str, Any]] = []
    pos = 0

    def _row_center_y(w: dict[str, Any]) -> float:
        return float((w["rect"].y0 + w["rect"].y1) / 2.0)

    def _cluster_rows(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        if not words:
            return []
        ws = sorted(words, key=lambda w: (_row_center_y(w), w["rect"].x0))
        rows: list[list[dict[str, Any]]] = []
        cur: list[dict[str, Any]] = []
        cur_y: Optional[float] = None
        # Works well for most scanned-exported CRF PDFs.
        y_tol = 3.2
        for w in ws:
            cy = _row_center_y(w)
            if cur_y is None or abs(cy - cur_y) <= y_tol:
                cur.append(w)
                if cur_y is None:
                    cur_y = cy
                else:
                    cur_y = (cur_y * (len(cur) - 1) + cy) / len(cur)
            else:
                rows.append(sorted(cur, key=lambda x: x["rect"].x0))
                cur = [w]
                cur_y = cy
        if cur:
            rows.append(sorted(cur, key=lambda x: x["rect"].x0))
        return rows

    for pno in range(doc.page_count):
        page = doc.load_page(pno)
        words = _page_words(page)
        if not words:
            if pno < doc.page_count - 1:
                pieces.append("\n")
                pos += 1
            continue

        rows = _cluster_rows(words)
        for ridx, row in enumerate(rows):
            if ridx > 0:
                pieces.append("\n")
                pos += 1

            prev_rect: Optional[fitz.Rect] = None
            for w in row:
                if prev_rect is not None:
                    gap = float(w["rect"].x0 - prev_rect.x1)
                    # Preserve likely table column boundaries.
                    sep = "\t" if gap >= 16.0 else " "
                    pieces.append(sep)
                    pos += 1

                start = pos
                txt = w["text"]
                pieces.append(txt)
                pos += len(txt)
                end = pos

                spans.append(
                    {
                        "page_index": pno,
                        "word_ordinal": len(spans),
                        "start": start,
                        "end": end,
                        "rect": w["rect"],
                        "text": txt,
                        "block": w["block"],
                        "line": w["line"],
                    }
                )
                prev_rect = w["rect"]

        if pno < doc.page_count - 1:
            pieces.append("\n")
            pos += 1

    return "".join(pieces), spans


def _safe_detect(detector: EntityDetector, text: str) -> list[DetectedEntity]:
    """
    PDF and DOCX should share the same detection call shape: one pass over the
    full extracted text. For very large texts NER is skipped inside the detector.
    """
    return detector.detect(text)


def _word_spans_overlapping(word_spans: list[dict[str, Any]], start: int, end: int) -> list[dict[str, Any]]:
    return [w for w in word_spans if w["start"] < end and start < w["end"]]


def _union_rect(rects: list[fitz.Rect]) -> Optional[fitz.Rect]:
    if not rects:
        return None
    r = fitz.Rect(rects[0])
    for rr in rects[1:]:
        r |= rr
    return r


def _fit_font_size(page: fitz.Page, rect: fitz.Rect, text: str, max_size: float) -> float:
    """
    Find a font size that fits into rect (roughly), decreasing if needed.
    """
    if max_size <= 1:
        return 1.0
    size = max_size
    for _ in range(12):
        rc = page.insert_textbox(
            rect,
            text,
            fontsize=size,
            fontname="helv",
            color=(0, 0, 0),
            align=fitz.TEXT_ALIGN_LEFT,
            overlay=True,
            render_mode=0,
            morph=None,
        )
        if rc >= 0:
            return size
        size *= 0.85
    return max(1.0, size)


def _apply_entity_replacements_to_pdf(
    file_bytes: bytes,
    entities: list[DetectedEntity],
    word_spans: list[dict[str, Any]],
    replacements: dict[str, str],
) -> bytes:
    """
    Redact original entity word boxes and overlay replacement text.
    Uses entity char spans to identify which words to redact.
    """
    # Validate that this looks like a PDF file
    if not file_bytes.startswith(b'%PDF-'):
        raise ValueError("Invalid PDF: does not start with PDF header")

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        error_msg = str(e)
        if "zlib error" in error_msg or "incorrect header check" in error_msg:
            logger.warning("PDF appears corrupted, attempting repair...")
            # Try to repair the document
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                if hasattr(doc, 'repair'):
                    doc.repair()
                    logger.info("PDF repair attempted")
                else:
                    raise ValueError("PDF document repair not available in this version") from e
            except Exception as repair_error:
                logger.warning("PDF repair failed: %s", repair_error)
                raise ValueError("PDF is corrupted and repair failed") from repair_error
        else:
            raise ValueError(f"Failed to open PDF: {e}") from e

    # Process in reverse order (by start) to reduce accidental overlap issues.
    ents = sorted(entities, key=lambda e: e.start, reverse=True)

    for e in ents:
        repl = replacements.get(e.text)
        if repl is None:
            continue
        if not e.text or not is_token_isolated(" " * e.start + e.text + " " * 0, 0, len(e.text)):
            pass

        overlaps = _word_spans_overlapping(word_spans, e.start, e.end)
        if not overlaps:
            continue

        # group by page
        by_page: dict[int, list[dict[str, Any]]] = {}
        for w in overlaps:
            by_page.setdefault(w["page_index"], []).append(w)

        for pno, ws in by_page.items():
            page = doc.load_page(pno)
            rects = [w["rect"] for w in ws]
            bbox = _union_rect(rects)
            if bbox is None:
                continue

            # Add redactions for all word rectangles
            for r in rects:
                page.add_redact_annot(r, fill=(1, 1, 1))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            
            max_size = max(4.0, min(14.0, bbox.height * 0.85))
            rc = page.insert_textbox(
                bbox,
                repl,
                fontsize=max_size,
                fontname="helv",
                color=(0, 0, 0),
                align=fitz.TEXT_ALIGN_LEFT,
                overlay=True,
            )
            if rc < 0:
                # Clear by re-redacting the bbox (harmless) and retry with smaller sizes.
                page.add_redact_annot(bbox, fill=(1, 1, 1))
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
                size = max_size
                for _ in range(12):
                    rc2 = page.insert_textbox(
                        bbox,
                        repl,
                        fontsize=size,
                        fontname="helv",
                        color=(0, 0, 0),
                        align=fitz.TEXT_ALIGN_LEFT,
                        overlay=True,
                    )
                    if rc2 >= 0:
                        break
                    size *= 0.85

    out = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return out


def _build_json(
    original_text: str,
    entities: list[DetectedEntity],
    pseudo_text: Optional[str],
    full_anon_text: Optional[str],
    mapping_table: Optional[MappingTableResponse],
    mode: str,
    excel_url: Optional[str],
    return_mapping: bool,
) -> dict:
    occ: dict[str, int] = {}
    for e in entities:
        occ[e.text] = occ.get(e.text, 0) + 1

    pseudo_map: dict[str, str] = {}
    if mapping_table:
        for entry in mapping_table.entries:
            pseudo_map[entry.original_value] = entry.token

    full_anon_map: dict[str, str] = {}
    for e in entities:
        if e.text not in full_anon_map:
            fn = _generaliser_for_entity_type(e.entity_type)
            full_anon_map[e.text] = fn(e.text)

    changes: list[dict] = []
    seen: set[str] = set()
    serial = 1
    for e in sorted(entities, key=lambda x: x.start):
        if e.text in seen:
            continue
        seen.add(e.text)
        changes.append(
            {
                "serial_no": serial,
                "entity_type": e.entity_type,
                "original_value": e.text,
                "pseudo_value": pseudo_map.get(e.text) if mode in ("pseudo", "both") else None,
                "full_anon_value": full_anon_map.get(e.text) if mode in ("full", "both") else None,
                "detection_source": e.source,
                "confidence": round(e.score, 4),
                "occurrences": occ[e.text],
            }
        )
        serial += 1

    payload: dict = {
        "original_text": original_text,
        "total_entities_found": len(entities),
        "total_values_changed": len(changes),
        "changes": changes,
        "pseudo_document": pseudo_text,
        "full_anon_document": full_anon_text,
        "mapping_excel_url": excel_url,
        "message": "Processing complete." if entities else "No PHI/PII entities detected.",
    }
    if return_mapping and mapping_table:
        payload["mapping_table"] = {
            "entries": [
                {
                    "token": e.token,
                    "original_value": e.original_value,
                    "entity_type": e.entity_type,
                    "source": getattr(e, "source", None),
                    "score": getattr(e, "score", None),
                }
                for e in mapping_table.entries
            ]
        }
    return payload


def process_pdf_bytes(
    file_bytes: bytes,
    mode: str = "both",
    salt: Optional[str] = None,
    return_mapping: bool = True,
    detector: Optional[EntityDetector] = None,
    excel_output_dir: str = "./mapping_exports",
) -> PdfAnonymisationResult:
    if detector is None:
        detector = EntityDetector()

    # Validate that this looks like a PDF file
    if not file_bytes.startswith(b'%PDF-'):
        return PdfAnonymisationResult(
            combined_json={
                "message": "Invalid file: does not appear to be a PDF (missing PDF header)",
                "total_entities_found": 0,
                "total_values_changed": 0,
                "changes": [],
                "pseudo_document": None,
                "full_anon_document": None,
            }
        )

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        error_msg = str(exc)
        if "zlib error" in error_msg or "incorrect header check" in error_msg:
            logger.warning("PDF appears corrupted, attempting repair...")
            # Try to repair the document
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                if hasattr(doc, 'repair'):
                    doc.repair()
                    logger.info("PDF repair attempted")
                else:
                    return PdfAnonymisationResult(
                        combined_json={
                            "message": "PDF document repair not available in this version. Please update PyMuPDF or use a repaired PDF file.",
                            "total_entities_found": 0,
                            "total_values_changed": 0,
                            "changes": [],
                            "pseudo_document": None,
                            "full_anon_document": None,
                        }
                    )
            except Exception as repair_error:
                logger.warning("PDF repair failed: %s", repair_error)
                return PdfAnonymisationResult(
                    combined_json={
                        "message": f"PDF is corrupted and repair failed. Error: {repair_error}",
                        "total_entities_found": 0,
                        "total_values_changed": 0,
                        "changes": [],
                        "pseudo_document": None,
                        "full_anon_document": None,
                    }
                )
        else:
            return PdfAnonymisationResult(
                combined_json={
                    "message": f"Failed to read PDF: {exc}",
                    "total_entities_found": 0,
                    "total_values_changed": 0,
                    "changes": [],
                    "pseudo_document": None,
                    "full_anon_document": None,
                }
            )

    full_text, word_spans = _build_text_stream(doc)
    doc.close()

    if not full_text.strip():
        return PdfAnonymisationResult(
            combined_json={
                "message": "No readable text found.",
                "total_entities_found": 0,
                "total_values_changed": 0,
                "changes": [],
                "pseudo_document": None,
                "full_anon_document": None,
            }
        )

    # Match DOCX flow: detect on full extracted text.
    entities = _safe_detect(detector, full_text)
    if not entities:
        return PdfAnonymisationResult(
            pseudo_pdf_bytes=file_bytes if mode in ("pseudo", "both") else None,
            full_anon_pdf_bytes=file_bytes if mode in ("full", "both") else None,
            combined_json={
                "message": "No PHI/PII entities detected. Document returned unchanged.",
                "total_entities_found": 0,
                "total_values_changed": 0,
                "changes": [],
                "pseudo_document": full_text,
                "full_anon_document": full_text,
            },
        )

    anon = DocumentAnonymiser()
    pseudo_text, full_anon_text, mapping = anon.anonymise(
        text=full_text,
        entities=entities,
        mode=mode,
        salt=salt,
    )

    mapping_table: Optional[MappingTableResponse] = mapping

    pseudo_replacements: dict[str, str] = {}
    merged_entries: list[MappingEntry] = []
    seen_original: set[str] = set()
    if mapping_table and mapping_table.entries:
        for entry in mapping_table.entries:
            if entry.original_value in seen_original:
                continue
            seen_original.add(entry.original_value)
            merged_entries.append(entry)
            pseudo_replacements[entry.original_value] = entry.token
        mapping_table = MappingTableResponse(entries=merged_entries)

    full_anon_replacements: dict[str, str] = {}
    if mode in ("full", "both"):
        for e in entities:
            if e.text and e.text not in full_anon_replacements:
                fn = _generaliser_for_entity_type(e.entity_type)
                full_anon_replacements[e.text] = fn(e.text)

    #  Export Excel mapping (same as docx flow) 
    excel_url: Optional[str] = None
    if mode in ("pseudo", "both") and mapping_table and mapping_table.entries:
        os.makedirs(excel_output_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        uid = uuid.uuid4().hex[:6].upper()
        out_path = os.path.join(excel_output_dir, f"mapping_{ts}_{uid}.xlsx")
        export_mapping_to_excel(
            mapping_entries=mapping_table.entries,
            output_path=out_path,
            original_text=full_text,
            meta={"mode": mode, "salt": bool(salt), "text_length": len(full_text)},
            entity_lookup={e.text: e for e in entities},
        )
        excel_url = f"/exports/{os.path.basename(out_path)}"

    pseudo_pdf_bytes: Optional[bytes] = None
    full_pdf_bytes: Optional[bytes] = None

    if mode in ("pseudo", "both") and pseudo_replacements:
        pseudo_pdf_bytes = _apply_entity_replacements_to_pdf(
            file_bytes=file_bytes,
            entities=entities,
            word_spans=word_spans,
            replacements=pseudo_replacements,
        )

    if mode in ("full", "both") and full_anon_replacements:
        full_pdf_bytes = _apply_entity_replacements_to_pdf(
            file_bytes=file_bytes,
            entities=entities,
            word_spans=word_spans,
            replacements=full_anon_replacements,
        )

    combined_json = _build_json(
        original_text=full_text,
        entities=entities,
        pseudo_text=pseudo_text,
        full_anon_text=full_anon_text,
        mapping_table=mapping_table,
        mode=mode,
        excel_url=excel_url,
        return_mapping=return_mapping,
    )

    return PdfAnonymisationResult(
        pseudo_pdf_bytes=pseudo_pdf_bytes,
        full_anon_pdf_bytes=full_pdf_bytes,
        combined_json=combined_json,
    )

