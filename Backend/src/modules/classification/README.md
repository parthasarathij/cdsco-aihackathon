# Classification Module

## Overview
This module exposes SAE and regulatory classification features through the shared `summary` service layer.
It provides classification routing and pipeline access while keeping integration logic inside `src/modules`.

## Module Structure
- `infrastructure/`
  - `router.py`: loads summary app path and exports classification FastAPI router.
  - `pipelines.py`: loads and exports `classification_pipeline`.
  - `summary_loader.py`: injects `Backend/summary` into `sys.path`.
- `application/`
  - `services.py`: exports classification pipeline to application callers.
- `domain/`
  - `contracts.py`: domain-facing contracts/interfaces.

## Runtime Integration
Classification routes are mounted as part of the summarisation/classification API bundle:
- Imported through `src/modules/summarisation/infrastructure/router.py`
- Included by `src/api/server.py` under `/api/v1`

Primary endpoint path:
- `/api/v1/classify/`

## Dependencies
This module depends on:
- `Backend/summary/app/api/endpoints/classify.py`
- `Backend/summary/app/services/classification_pipeline.py`

## Notes
- This module is an integration boundary, not a full standalone classifier implementation.
- Business logic remains in the shared `summary` application package.
