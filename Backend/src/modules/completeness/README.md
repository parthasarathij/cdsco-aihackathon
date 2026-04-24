# Completeness Module

## Overview
This module performs dossier completeness and relevance assessment against regulatory checklists.
It supports:
- Checklist ingestion and embedding
- Chroma-based similarity search
- LLM-assisted document description and matching
- Match status classification (`matched`, `needs_user_confirmation`, `missing`)

## Module Structure
- `application/`
  - `checker_service.py`: application-level entry to checklist matching.
- `domain/`
  - `types.py`: typed domain models for checklist and matching outputs.
- `infrastructure/`
  - `stores.py`: storage abstractions and integrations.
- Core processing files:
  - `checklist.py`, `embed.py`, `chroma_store.py`
  - `extract.py`, `match.py`, `match_chroma.py`, `relevance.py`
  - `llm_describer.py`, `llm_plain_paragraph.py`, `llm_review.py`
  - `zip_compare.py`

## Runtime Integration
In main API runtime, this module is used via the compatibility shim:
- `src/checker/__init__.py` maps `src.checker.*` imports to this folder.
- `src/api/server.py` imports `src.checker.*` components for completeness and comparison endpoints.

## Key Behaviors
- Detects dossier module folders (`m1`, `module 1`, etc.).
- Extracts text from dossier documents.
- Computes semantic similarity against checklist items.
- Applies strict and partial thresholds for decision states.

## Notes
- Vector store behavior and embedding model selection are environment/config driven.
- This module is designed to support both deterministic and LLM-assisted matching paths.
