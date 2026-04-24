# Summarisation Module

## Overview
This module exposes summarisation and related endpoints by integrating the shared `summary` application package into the main backend runtime.
It handles:
- Application document summarisation
- SAE summarisation
- Meeting summarisation
- Classification route aggregation (via shared summary API router)

## Module Structure
- `infrastructure/`
  - `router.py`: exports aggregated API router from `summary/app/api/api.py`.
  - `pipelines.py`: exports summarization, SAE, and meeting pipelines.
  - `summary_loader.py`: ensures `Backend/summary` is available on `sys.path`.
- `application/`
  - `services.py`: application-level exports of active pipelines.
- `domain/`
  - `contracts.py`: module-level domain contracts.

## Runtime Integration
Mounted by:
- `src/api/server.py` under `/api/v1`

Primary endpoint groups:
- `/api/v1/summarize/`
- `/api/v1/sae_summarize/`
- `/api/v1/meeting_summarize/`
- `/api/v1/classify/`

## Dependencies
This module delegates implementation to:
- `Backend/summary/app/api/*`
- `Backend/summary/app/services/*`
- `Backend/summary/app/models/*`

## Notes
- This folder is the integration boundary used by the main API.
- Core LLM orchestration logic is implemented in the `summary` package.
