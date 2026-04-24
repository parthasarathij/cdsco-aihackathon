from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import os
import zipfile
from pathlib import Path

from .text_io import extract_text_from_path

MODULE_ORDER = ("M1", "M2", "M3", "M4", "M5")
MAX_MODULE_TEXT_CHARS = 400_000
MAX_SINGLE_FILE_CHARS = 120_000


def _dossier_root_after_extract(extract_dir: Path) -> Path:
    entries = [p for p in extract_dir.iterdir() if p.name not in {"__MACOSX"}]
    return entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_dir


def discover_module_directories(dossier_root: Path) -> dict[str, Path]:
    """
    Find the first directory named m1..m5 (case-insensitive) under dossier_root.
    Skips __MACOSX. If the same module appears at multiple paths, the first discovery wins.
    """
    found: dict[str, Path] = {}
    skip = {"__macosx"}

    for dirpath, dirnames, _filenames in os.walk(dossier_root, topdown=True):
        parts_lower = {p.lower() for p in Path(dirpath).parts}
        if "__macosx" in parts_lower:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d.lower() not in skip]
        low_map = {d.lower(): d for d in dirnames}
        for key in MODULE_ORDER:
            low = key.lower()
            if low in low_map and key not in found:
                found[key] = Path(dirpath) / low_map[low]
    return found


def _iter_pdf_docx(module_root: Path) -> list[Path]:
    out: list[Path] = []
    for p in sorted(module_root.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".pdf", ".docx"):
            continue
        if "__MACOSX" in p.parts:
            continue
        out.append(p)
    return out


def aggregate_text_for_module(module_root: Path, *, rel_to: Path) -> tuple[str, list[str]]:
    """
    Concatenate text from all PDF/DOCX under module_root (bounded size).
    Returns (full_text, list of relative paths included).
    """
    files = _iter_pdf_docx(module_root)
    chunks: list[str] = []
    used: list[str] = []
    total = 0
    for fp in files:
        rel = str(fp.relative_to(rel_to)).replace("\\", "/")
        try:
            raw = extract_text_from_path(fp)
        except Exception:
            raw = ""
        piece = raw[:MAX_SINGLE_FILE_CHARS]
        block = f"\n\n===== {rel} =====\n\n{piece}"
        if total + len(block) > MAX_MODULE_TEXT_CHARS:
            remain = MAX_MODULE_TEXT_CHARS - total
            if remain > 500:
                chunks.append(block[:remain])
                used.append(rel)
            break
        chunks.append(block)
        used.append(rel)
        total += len(block)
    return ("".join(chunks)[:MAX_MODULE_TEXT_CHARS], used)


def load_module_texts_from_extracted_zip_dir(extract_dir: Path) -> tuple[dict[str, str], dict[str, list[str]]]:
    """
    After zipfile.extractall to extract_dir, resolve dossier root, discover M* dirs,
    return (module -> combined text, module -> source file paths relative to dossier root).
    """
    root = _dossier_root_after_extract(extract_dir)
    dirs = discover_module_directories(root)
    texts: dict[str, str] = {}
    index: dict[str, list[str]] = {}
    for key in MODULE_ORDER:
        if key not in dirs:
            continue
        text, paths = aggregate_text_for_module(dirs[key], rel_to=root)
        texts[key] = text
        index[key] = paths
    return texts, index


def load_module_texts_from_zip_bytes(zip_data: bytes, *, work_dir: Path) -> tuple[dict[str, str], dict[str, list[str]]]:
    extract_dir = work_dir / "extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    zpath = work_dir / "upload.zip"
    zpath.write_bytes(zip_data)
    with zipfile.ZipFile(zpath, "r") as zf:
        zf.extractall(extract_dir)
    return load_module_texts_from_extracted_zip_dir(extract_dir)
