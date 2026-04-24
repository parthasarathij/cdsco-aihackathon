from __future__ import annotations

"""
ZIP handling (in-memory) and full PDF text extraction via PyMuPDF.
"""

from utils.logger import get_logger

import io
import logging
import re
import zipfile
from pathlib import PurePosixPath

logger = get_logger(__name__)


def _safe_zip_name(name: str) -> bool:
    """Reject zip-slip paths."""
    if not name or name.startswith("/"):
        return False
    parts = PurePosixPath(name.replace("\\", "/")).parts
    return ".." not in parts and not any(p.startswith("__MACOSX") for p in parts)


def _detect_module_from_zip_path(zip_inner_path: str) -> str | None:
    """
    Infer CTD module (M1–M5) from archive path or filename.
    Handles paths like ``m1/...``, ``M2_admin.pdf``, ``module3/quality.pdf``.
    """
    path = zip_inner_path.replace("\\", "/")
    lower = path.lower()
    parts = [p for p in lower.split("/") if p]

    for p in parts:
        if p in ("m1", "m2", "m3", "m4", "m5"):
            return p.upper()
        m = re.match(r"^module\s*([1-5])$", p) or re.match(r"^module([1-5])$", p)
        if m:
            return f"M{m.group(1)}"

    for i in range(1, 6):
        if re.search(rf"(^|/|\\)m{i}(?=/|_|\.|$)", lower):
            return f"M{i}"
    return None


def _pdf_bytes_to_text(pdf_bytes: bytes) -> str:
    """Extract plain text from PDF bytes using PyMuPDF (fitz)."""
    import fitz  
    import sys
    import io as io_module

    # Validate that this looks like a PDF file
    if not pdf_bytes.startswith(b'%PDF-'):
        logger.warning("Invalid PDF: does not start with PDF header")
        return ""

    # Suppress MuPDF's stderr output during processing
    old_stderr = sys.stderr
    sys.stderr = io_module.StringIO()
    
    try:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            error_msg = str(e)
            if "zlib error" in error_msg or "incorrect header check" in error_msg:
                logger.warning("PDF appears corrupted, attempting repair...")
                # Try to repair the document
                try:
                    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    # Attempt to repair
                    if hasattr(doc, 'repair'):
                        doc.repair()
                        logger.info("PDF repair attempted")
                    else:
                        logger.warning("Document repair method not available")
                        return ""
                except Exception as repair_error:
                    logger.warning("PDF repair failed: %s", repair_error)
                    return ""
            else:
                logger.warning("Failed to open PDF: %s", error_msg)
                return ""

        try:
            parts: list[str] = []
            for page_num, page in enumerate(doc):
                try:
                    parts.append(page.get_text() or "")
                except Exception as e:
                    error_msg = str(e)
                    if "zlib error" in error_msg or "incorrect header check" in error_msg:
                        logger.warning("PDF page %d extraction failed due to corruption, skipping", page_num)
                    else:
                        logger.warning("PDF page %d text extraction failed: %s", page_num, e)
                    parts.append("")
            return "\n".join(parts)
        finally:
            doc.close()
    finally:
        # Restore stderr
        sys.stderr = old_stderr


def extract_module_texts(zip_bytes: bytes) -> dict[str, str]:
    """
    Unzip in memory.
    For each PDF, detect module from filename (m1/m2/m3/m4/m5 case-insensitive).
    Extract full text using pymupdf (fitz).
    If multiple PDFs in same module, concatenate their text.
    Return: { "M1": "full text...", "M2": "...", ... }
    """
    # Check ZIP size before processing - Updated for 50GB+ support
    MAX_ZIP_SIZE = 60000 * 1024 * 1024  # 60GB
    if len(zip_bytes) > MAX_ZIP_SIZE:
        logger.error(f"ZIP file too large: {len(zip_bytes)} bytes")
        return {}

    out: dict[str, list[str]] = {}
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
    except zipfile.BadZipFile as e:
        logger.error("Invalid ZIP: %s", e)
        return {}

    try:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if not _safe_zip_name(name):
                continue
            if not name.lower().endswith(".pdf"):
                continue
            
            # Check individual PDF file size (5GB limit per PDF) - Updated for 50GB+ support
            MAX_PDF_SIZE = 5000 * 1024 * 1024  # 5GB
            if info.file_size > MAX_PDF_SIZE:
                logger.warning(f"PDF file too large, skipping: {name} ({info.file_size} bytes)")
                continue
                
            mod = _detect_module_from_zip_path(name)
            if not mod:
                continue
                
            try:
                data = zf.read(info)
                # Double-check size after reading
                if len(data) > MAX_PDF_SIZE:
                    logger.warning(f"PDF data too large after reading, skipping: {name}")
                    continue
                    
                text = _pdf_bytes_to_text(data)
                if text.strip():
                    out.setdefault(mod, []).append(text)
            except MemoryError:
                logger.error(f"Memory error processing PDF: {name}")
                continue
            except Exception as e:
                logger.warning("Extraction failed for %s: %s", name, e)
                continue
    finally:
        zf.close()

    return {k: "\n\n".join(parts) for k, parts in out.items()}
