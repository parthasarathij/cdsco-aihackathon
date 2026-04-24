# Pre-Processing Service (OCR Pipeline)

## Overview
`pre_processing` is a dedicated OCR and document rendering service.
It accepts PDF inputs, performs layout/table/text extraction, and returns:
- Structured JSON output
- Searchable rendered PDF
- Extracted visual assets (for example logos, stamps, seals)

It supports both local filesystem mode and Azure Blob Storage mode.

## Key Capabilities
- PDF to image conversion using PyMuPDF
- Layout detection, OCR assignment, and table extraction
- Asset extraction and packaging per job
- Searchable PDF rendering from extracted text blocks
- Optional blob-based input/output and model download

## Main Entry Points
- `api.py`: FastAPI service with multi-file/folder support.
- `main.py`: CLI entrypoint that processes all subfolders in the input directory.
- `ocr/`: detection and OCR processing pipeline.
  - `pipeline.py`
  - `processors/`, `services/`, `utils/`
- `renderer/`: JSON-to-PDF rendering utilities.
- `config/settings.py`: runtime configuration and environment binding.
- `utils/blob_storage.py`: Azure Blob interactions.
- `utils/logger.py`: structured logging with optional blob logging sink.

## API Highlights
- `GET /` and `GET /health`: health endpoints.
- `POST /process`: Process a single PDF.
- `POST /process-multiple`: Process multiple PDFs in one request.
- `POST /process-zip`: Upload a ZIP containing multiple PDFs or folders of images.

## Configuration
Important settings are read from `.env` through `config/settings.py`, including:
- Storage mode (`USE_AZURE_BLOB`)
- Model directories (local or blob-backed)
- Input/output/assets/log directories
- Azure Blob container and path settings

## Running Locally
1. Install dependencies from `requirements.txt`.
2. Configure `.env` values.
3. Start service:

```bash
python main.py
```

Default local run target in `main.py` uses port `8080`.

## Notes
- In blob mode, model artifacts can be downloaded at startup into temporary directories.
- Temporary model directories are cleaned up on shutdown.
