# CDSCO Dossier Processing Backend

## Overview
This folder contains the backend services for the CDSCO (Central Drugs Standard Control Organization) Dossier Processing system. It is a Python-based ecosystem designed to automate the ingestion, analysis, and validation of regulatory dossiers (CTD Modules 1-5).

## Purpose and Responsibilities
The backend is responsible for:
- **Dossier Validation:** Checking uploaded ZIP files or folders against the official CDSCO CTD checklist.
- **Document Classification:** Automatically identifying the type and module of uploaded documents.
- **Automated Summarization:** Generating summaries for clinical study reports, SAE (Serious Adverse Event) reports, and meeting minutes.
- **Anonymization:** Detecting and masking sensitive PII (Personally Identifiable Information) in PDF and DOCX documents.
- **OCR & Layout Analysis:** Extracting text and structure from scanned documents and complex PDF layouts.
- **Vector Search:** Utilizing ChromaDB to perform semantic matching between document content and checklist requirements.

## Folder Structure
- **`src/`**: Core application logic.
  - `api/`: FastAPI server and route definitions.
  - `modules/`: Feature-specific modules (Anonymisation, Classification, Completeness, Summarisation).
  - `checker/`: Logic for dossier completeness and consistency checks.
- **`pre_processing/`**: OCR pipeline and document layout analysis tools.
- **`summary/`**: LLM-powered summarization services and specialized pipelines (SAE, Meeting Minutes).
- **`constants/`**: Configuration files and dossier field mappings.
- **`utils/`**: Shared utility functions for document extraction and processing.
- **`mapping_exports/`**: Storage for generated Excel reports and mapping files.

## Technologies Used
- **Web Framework:** [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/)
- **LLM & NLP:** [LangChain](https://www.langchain.com/), [Transformers](https://huggingface.co/docs/transformers/index), [Sentence-Transformers](https://www.sbert.net/)
- **Vector Database:** [ChromaDB](https://www.trychroma.com/)
- **Document Processing:** [PyMuPDF (fitz)](https://pymupdf.readthedocs.io/), [pypdf](https://pypdf.readthedocs.io/), [python-docx](https://python-docx.readthedocs.io/)
- **Data Science:** [Pandas](https://pandas.pydata.org/), [NumPy](https://numpy.org/), [Scikit-learn](https://scikit-learn.org/)
- **Cloud Storage:** [Azure Blob Storage](https://azure.microsoft.com/en-us/services/storage/blobs/)
- **ML Frameworks:** [PyTorch](https://pytorch.org/), [PEFT](https://huggingface.co/docs/peft/index)

## Setup and Installation
1. **Create a Virtual Environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
2. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Environment Configuration:**
   Create a `.env` file in the `Backend/` directory with the following variables:
   ```env
   AZURE_STORAGE_CONNECTION_STRING=your_connection_string
   # Add other necessary environment variables
   ```

## How to Run
### Start the FastAPI Server
The main entry point for the API is `main.py`:
```bash
python main.py
```
The server will start at `http://127.0.0.1:8000`. You can access the interactive API documentation at `http://127.0.0.1:8000/docs`.

### CLI Tools
For standalone dossier checks:
```bash
python -m src.cli check-folder --folder "path/to/dossier"
```

## Important Notes & Best Practices
- **Large Model Handling:** Some modules (like Anonymisation) use LoRA adapters and large language models. Ensure you have sufficient RAM/VRAM or configured API access.
- **Persistence:** ChromaDB indexes are stored in `.chroma_ctd_checklist/`. Do not delete this folder unless you want to re-index the checklist.
- **Concurrency:** Use the asynchronous endpoints provided by FastAPI for long-running document processing tasks.
- **Logging:** Check `logs/` (if configured) or stdout for detailed processing information.
