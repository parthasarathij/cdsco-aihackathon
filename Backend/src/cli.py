from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import json
from pathlib import Path

import typer

from .checker.embed import DEFAULT_EMBED_MODEL
from .checker.match_chroma import check_folder_against_checklist
from .checker.chroma_store import build_or_load_chroma_for_checklist


app = typer.Typer(add_completion=False)

def _default_checklist_path() -> str:
    repo_src_root = Path(__file__).resolve().parent
    checklist = repo_src_root / "modules" / "completeness" / "CDSCO_CTD_Dossier_Checklist_Updated.xlsx"
    return str(checklist)


@app.command("check-folder")
def check_folder(
    folder: str = typer.Option(..., help="Uploaded dossier folder containing Module 1..5 subfolders."),
    checklist: str = typer.Option(_default_checklist_path(), help="Path to checklist .xlsx"),
    embed_model: str = typer.Option(DEFAULT_EMBED_MODEL, help="Embedding model name or local path."),
    hf_token: str | None = typer.Option(None, help="HF token (optional; also supports env var HF_TOKEN)."),
    enable_llm_descriptions: bool = typer.Option(
        True, help="Use OpenAI LLM to summarize each document before embedding."
    ),
    llm_model_path: str = typer.Option(
        "gpt-4o-mini", help="OpenAI model name."
    ),
    llm_max_new_tokens: int = typer.Option(220, help="Max new tokens for Llama summarization."),
    llm_snippet_max_chars: int = typer.Option(6000, help="Max snippet chars sent to Llama."),
    strict_threshold: float = typer.Option(0.62, help="Score >= strict => matched"),
    partial_gap: float = typer.Option(0.10, help="partial confirmation band: strict - partial_gap .. strict"),
    out_json: str | None = typer.Option(None, help="If provided, write JSON to this file."),
) -> None:
    report = check_folder_against_checklist(
        checklist_xlsx=checklist,
        dossier_folder=folder,
        embed_model=embed_model,
        hf_token=hf_token,
        strict_threshold=strict_threshold,
        partial_gap=partial_gap,
        enable_llm_descriptions=enable_llm_descriptions,
        llm_model_path=llm_model_path,
        llm_max_new_tokens=llm_max_new_tokens,
        llm_snippet_max_chars=llm_snippet_max_chars,
    )
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if out_json:
        Path(out_json).write_text(text, encoding="utf-8")
    print(text)


@app.command("build-index")
def build_index(
    checklist: str = typer.Option(
        _default_checklist_path(), help="Path to checklist .xlsx"
    ),
    embed_model: str = typer.Option(DEFAULT_EMBED_MODEL, help="Embedding model name."),
    hf_token: str | None = typer.Option(None, help="HF token (optional; or set HF_TOKEN env var)."),
    persist_directory: str = typer.Option(".chroma_ctd_checklist", help="Chroma persist directory."),
    collection_name: str = typer.Option("ctd_checklist_items", help="Chroma collection name."),
) -> None:
    """
    Pre-build and persist Chroma embeddings for the checklist.
    """
    vectorstore, _id_map = build_or_load_chroma_for_checklist(
        checklist_xlsx=checklist,
        persist_directory=persist_directory,
        embed_model=embed_model,
        hf_token=hf_token,
        collection_name=collection_name,
    )
    print(f"Chroma index ready at: {persist_directory}")


if __name__ == "__main__":
    app()

