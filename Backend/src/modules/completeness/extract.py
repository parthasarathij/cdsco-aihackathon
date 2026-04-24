from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from pathlib import Path

from docx import Document
from pypdf import PdfReader


def extract_all_pages(path: str | Path) -> list[str]:
    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    return pages


def extract_all_paragraphs(path: str | Path) -> list[str]:
    doc = Document(str(path))
    return [p.text for p in doc.paragraphs if p.text]


def _adaptive_pdf_page_limit(section_id: str | None, default_pages: int) -> int:
    sid = (section_id or "").strip()
    if sid.startswith("4.") or sid.startswith("5.3") or sid.startswith("3.2.S") or sid.startswith("3.2.P"):
        return 5
    return default_pages


def extract_substantive_pdf_pages(pdf_path: str | Path, *, target_pages: int = 3) -> str:
    """
    Skip sparse pages (cover/TOC-like) and return first substantive pages.
    Fallback to first pages when no substantive content is detected.
    """
    all_pages = extract_all_pages(pdf_path)
    substantive: list[str] = []
    for page_text in all_pages:
        words = page_text.split()
        lines = [l.strip() for l in page_text.splitlines() if l.strip()]
        avg_line_length = sum(len(l) for l in lines) / max(len(lines), 1)
        if len(words) > 80 and avg_line_length > 40:
            substantive.append(page_text)
        if len(substantive) >= target_pages:
            break
    if substantive:
        return "\n".join(substantive).strip()
    return "\n".join(all_pages[:target_pages]).strip()


def extract_substantive_docx_text(docx_path: str | Path, *, max_chars: int = 3000) -> str:
    paragraphs = extract_all_paragraphs(docx_path)
    combined: list[str] = []
    word_count = 0
    skip_initial = True
    current_chars = 0
    for para in paragraphs:
        words = para.split()
        if skip_initial and word_count < 100 and len(words) < 15:
            continue
        skip_initial = False
        combined.append(para)
        word_count += len(words)
        current_chars += len(para)
        if current_chars >= max_chars:
            break
    return "\n".join(combined)[:max_chars].strip()


def extract_text_first_pages(
    path: str | Path,
    *,
    section_id: str | None = None,
    max_pdf_pages: int = 3,
    max_docx_chars: int = 18_000,
) -> str:
    """
    Extract text for matching.

    - PDF: first N pages (true pages)
    - DOCX: DOCX doesn't have a stable concept of pages without rendering, so we take first ~N chars.
    """
    path = Path(path)
    ext = path.suffix.lower()
    if ext == ".pdf":
        max_pages = _adaptive_pdf_page_limit(section_id, max_pdf_pages)
        return extract_substantive_pdf_pages(path, target_pages=max_pages)

    if ext == ".docx":
        return extract_substantive_docx_text(path, max_chars=max_docx_chars)

    raise ValueError(f"Unsupported file type: {ext}. Expected .pdf or .docx")

