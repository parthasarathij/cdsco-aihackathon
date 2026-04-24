# Dossier Checker Module

## Overview
This module provides field-level consistency checks for regulatory dossiers.
It focuses on extracting module text and validating configured field expectations through rule and LLM-based checks.

## Module Structure
- `application/`
  - `service.py`: application entrypoint (delegates to engine logic).
- `domain/`
  - `types.py`: domain types for check results.
- `infrastructure/`
  - `api.py`: API bridge/export layer.
- Core implementation:
  - `engine.py`: orchestrates dossier checking workflow.
  - `zip_loader.py`: handles ZIP-based dossier ingestion.
  - `text_io.py`: text extraction and normalization helpers.
  - `proximity.py`: field anchor and proximity matching logic.
  - `api.py`: root-level compatibility API export.

## Runtime Integration
This module is used through:
- `src/dossier_checker/__init__.py` compatibility shim
- Legacy dossier routes under `src/api/routers/dossier_checker.py`
- Additional consistency paths in `src/api/server.py`

## Data Dependencies
Field maps and anchors are sourced from:
- `src/constants/dossier_field_maps.py`

## Notes
- This module is optimized for dossier ZIP inputs and module-wise extraction.
- It is part of the unified backend runtime and not a separate service binary.
