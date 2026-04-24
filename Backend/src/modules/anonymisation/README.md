# Anonymisation Module

## Overview
This module handles PHI/PII detection and anonymisation for dossier documents.
It supports:
- Entity detection (regex + transformer NER + LoRA adapter)
- Pseudonymisation and full anonymisation
- JSON and DOCX-oriented anonymisation workflows
- Mapping export for traceability

## Module Structure
- `infrastructure/`
  - `router.py`: exports FastAPI router and startup init hooks.
  - `api.py`: API endpoints for anonymisation and utility routes.
- Core implementation:
  - `detector.py`: hybrid entity detection pipeline.
  - `anonymizer.py`: replacement and re-identification logic.
  - `docx_anonymiser.py`: DOCX-specific processing.
  - `pdf_anonymiser.py`: PDF-focused helpers.
  - `models.py`: DTOs and API models.
  - `entity_fields.py`: normalized output field catalog.

## Runtime Integration
This module is mounted by the main backend API in:
- `src/api/server.py`
  - Included under the `/anonymisation` prefix.

Startup initialization is triggered through:
- `infrastructure/router.py` -> `api.py` (`init_anonymisation`).

## Model Assets
Inference expects local model assets under:
- `dslimbert-base-NER/`
- `ner_lora_adapter/`

Legacy or training artifacts are present in this folder but are not required for core runtime inference.

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Place your Kaggle adapter

Copy the exported adapter folder from Kaggle into `adapter_weights/`:

```
adapter_weights/
├── adapter_config.json
├── adapter_model.safetensors   ← or adapter_model.bin
└── tokenizer_config.json       ← optional, uses base tokenizer if absent
```

Or set the environment variable to a different path:

```bash
export ADAPTER_PATH=/path/to/your/adapter_folder
```

If no adapter is found, the API falls back to the base `dslim/bert-base-NER` weights automatically.

### 3. Run the API

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive docs: http://localhost:8000/docs

## API Endpoints

### `POST /process`
Main endpoint — takes text, returns anonymised document(s).

**Request body:**
```json
{
  "text": "SOME TEXT",
  "mode": "both",
  "return_mapping": true,
  "salt": "optional-hmac-salt"
}
```

**`mode` options:**
| Value    | Effect |
|----------|--------|
| `pseudo` | Step 1 only — reversible token replacement |
| `full`   | Steps 1+2 — irreversible generalisation |
| `both`   | Returns both pseudo and fully anonymised versions |

**Response:**
```json
{
  "original_text": "...",
  "entities_detected": [...],
  "pseudo_text":    "Patient Name: PER_A1B2C3D4, Age 32, Aadhaar AAD_E5F6G7H8, ...",
  "full_anon_text": "Patient Name: <PATIENT_ID>, Age 30-39, Aadhaar XXXX XXXX XXXX, ...",
  "mapping_table": {
    "entries": [
      {"token": "PER_A1B2C3D4", "original_value": "user", "entity_type": "PERSON"},
      {"token": "AAD_E5F6G7H8", "original_value": "1234 5678 9012", "entity_type": "AADHAAR"}
    ]
  },
  "message": "Processing complete."
}
```

### `POST /detect-only`
Returns detected entities without modifying the document.

### `POST /upload`
Upload a `.txt` file directly for processing.

### `GET /health`
Health check.

## Detected Entity Types

| Entity Type        | Detection Method | Example |
|--------------------|-----------------|---------|
| `PERSON`           | NER + context   | person Name |
| `AADHAAR`          | Regex           | 1234 5678 9012 |
| `PAN`              | Regex           | ABCDE1234F |
| `PHONE`            | Regex           | 9876543210 |
| `EMAIL`            | Regex           | user@example.com |
| `DATE`             | Regex           | 15-Mar-2026 |
| `AGE`              | Regex + NER     | Age 32 |
| `IP_ADDRESS`       | Regex           | 192.168.1.1 |
| `LOCATION`         | NER             | Bengaluru |
| `DIAGNOSIS`        | NER             | Type-2 Diabetes |
| `MEDICAL_CONDITION`| NER             | Hypertension |
| `PATIENT_ID`       | Regex           | MRN #PT-001 |
| `PASSPORT`         | Regex           | J1234567 |
| `BANK_ACCOUNT`     | Regex           | 123456789012 |

## Run Offline Tests

```bash
python test_pipeline.py
```

Tests detection + pseudo-anonymisation + full anonymisation + re-identification
on 3 sample documents without starting the server.

## Production Checklist

- [ ] AES-256 encrypt the mapping table before persistence
- [ ] Store mapping table in a separate vault (not with the anonymised data)
- [ ] Use a strong, secret HMAC `salt` for deterministic tokens
- [ ] Enable HTTPS / TLS termination in front of uvicorn
- [ ] Set `ADAPTER_PATH` environment variable in deployment config
- [ ] Implement `/reidentify` endpoint behind strict RBAC authentication
- [ ] Log all anonymisation operations for DPDP Act audit trail

## Typical API Capabilities
- Health and metadata endpoints (entity fields, exports list)
- Document text anonymisation
- File upload processing (including DOCX flow)
- Mapping export generation

## Notes
- This module can run as part of the unified backend API and also has standalone legacy scripts for experimentation.
