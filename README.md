# CDSCO Dossier Processing System

This repository contains the CDSCO (Central Drugs Standard Control Organization) Dossier Processing system, split into two main parts:

- `Backend/` — Python backend services for dossier ingestion, validation, OCR, summarization, anonymization, and API support.
- `frontend/` — React + Vite frontend application for uploading dossiers, reviewing results, and interacting with the analysis UI.

---

## Repository Structure

- `Backend/`
  - Python-based processing engine and API layer
  - FastAPI server, document analysis modules, OCR pipeline, and ChromaDB vector search
  - Contains its own `README.md` with setup and run instructions

- `frontend/`
  - React + TypeScript client application
  - UI for dossier uploading, result visualization, and interactive review
  - Contains its own `README.md` with install and run instructions

---

## Portals and Modules

The system provides two distinct environments tailored to different stages of the regulatory workflow: one for high-throughput automated ingestion (**eCTD Module**) and one for guided, interactive submission (**SUGAM Portal**).

### 1. eCTD Module (Electronic Common Technical Document)
The **eCTD Module** serves as the high-performance engine for large-scale dossier submissions. It is designed to process complete drug dossiers (Modules 1-5) and provide a deep analytical workspace for reviewers.

#### **Technical Workflow**
1.  **High-Throughput Ingestion**: Supports bulk uploading of nested folder structures or ZIP archives.
2.  **Advanced AI OCR Pipeline**: Scanned documents and complex PDFs are processed via an OCR pipeline that identifies layouts, extracts text, and preserves structural hierarchy.
3.  **Semantic Vectorization**: Extracted text is transformed into high-dimensional embeddings using `Sentence-Transformers` and indexed in `ChromaDB`.
4.  **Intelligent Completeness Matching**: The system performs a semantic search against the official CDSCO checklist to identify if required documents exist, even if they are named differently.
5.  **LLM Relevance Verification**: A specialized LLM (e.g., `gpt-4o-mini`) performs a deep content review to verify that a file's actual substance matches its regulatory purpose (e.g., ensuring a "Stability Report" actually contains stability data).

#### **Key Features**
-   **Interactive Workspace Browser**: A dual-pane interface allowing reviewers to browse the original dossier tree while viewing AI-processed results.
-   **Automatic Module Classification**: Files are automatically tagged and grouped into the standard five CTD modules.
-   **Section-Specific AI Summarization**: Reviewers can generate concise summaries of massive clinical study reports or safety data on demand.

### 2. SUGAM Portal
The **SUGAM Portal** provides an interactive, guided experience for applicants preparing specific drug submissions. It enhances the traditional CDSCO portal with intelligent validation tools.

#### **User Journey**
1.  **Pathway Selection**: Users choose between **NDA (New Drug Application)** or **Generic** drug workflows, which dynamically adjusts the required checklist.
2.  **Guided Document Upload**: An interactive checklist provides a step-by-step path for individual document submission, ensuring no requirement is overlooked.
3.  **Real-Time Validation**: As documents are uploaded, they are cross-referenced with the approved drug database for accuracy in names and strengths.
4.  **PII Anonymization**: Before final submission, users can run a dedicated anonymization tool that uses Named Entity Recognition (NER) to redact sensitive patient or practitioner information.
5.  **Intelligent Version Control**: A version comparison tool identifies precisely what has changed between two dossier versions, highlighting additions, deletions, and modifications with AI-generated descriptions of the changes.

#### **Key Features**
-   **Drug Eligibility Checker**: Direct integration with the CDSCO database [CDSCO_Approved_Drugs.xlsx] to validate application details.
-   **Anonymization Suite**: Protects data privacy through automated redaction of names, locations, and dates.
-   **Delta Analysis**: Simplifies the review of resubmissions by focusing only on the "delta" (changes) between versions.

### Feature Summary

| Feature | Portal | Description |
| :--- | :--- | :--- |
| **Dossier Upload** | eCTD | Bulk ingestion and automated OCR processing of entire submissions. |
| **Semantic Checklist** | Both | AI-driven matching of documents against regulatory requirements. |
| **PII Anonymization** | SUGAM | Automated redaction of sensitive data using transformer models. |
| **Version Delta** | SUGAM | Comparative analysis between dossier versions with AI descriptions. |
| **Drug Database Sync** | Both | Validation against the live CDSCO approved drug list. |
| **Clinical Summaries** | eCTD | Condensation of large-scale clinical reports into actionable summaries. |

---

## Feature Deep-Dive

Our system leverages specialized AI modules to handle the complexities of regulatory document processing.

### 1. AI-Driven Anonymization
The **Anonymization Suite** ensures regulatory compliance by protecting Personal Identifiable Information (PII) before documents are shared or archived.
- **NER-Based Detection**: Uses advanced Transformer models (`dslim-bert-base-NER`) fine-tuned with LoRA adapters to detect names, locations, dates, and medical IDs.
- **Smart Redaction Modes**:
    - **Generalization**: Replaces specific dates with `[DATE_REDACTED]` or ages with ranges (e.g., `40-49`).
    - **Mapping**: Creates a secure, reversible mapping table to track patient IDs while keeping their real identities hidden.
    - **Redaction**: Direct masking of sensitive fields like Phone, Email, PAN, and Aadhaar numbers.
- **Medical Context Awareness**: Specifically trained to identify and generalize sensitive medical conditions into broader categories (e.g., "cardiovascular condition").

### 2. Intelligent Summarization
Processing clinical reports and meeting minutes is accelerated through an automated **Map-Reduce Summarization** architecture.
- **Multiphase Processing**:
    1. **Map Phase**: Large documents are chunked, and each chunk is summarized independently to capture granular detail.
    2. **Reduce Phase**: Chunk summaries are aggregated into a cohesive, non-redundant narrative.
    3. **Overall Summary**: A high-level executive summary is generated for rapid decision-making.
- **Task-Specific Logic**: Tailored pipelines for **SAE (Serious Adverse Events)** reports, medical study findings, and administrative meeting minutes.

### 3. Dossier Consistency Checker
This feature ensures that critical data is consistent across all five modules (M1-M5) of a drug application.
- **Field-Level Extraction**: Automatically extracts 10+ critical fields including **Product Name**, **Strength**, **Shelf Life**, and **Storage Conditions**.
- **Cross-Module Comparison**: Uses normalization logic to compare these fields across different sections (e.g., ensuring the shelf life stated in Module 1 matches Module 3).
- **Conflict Resolution**: Highlights discrepancies in red for manual review, with AI-generated notes explaining the nature of the inconsistency.

### 4. Completeness & Semantic Matching
Moves beyond simple file-count checks to verify the presence and relevance of required documentation.
- **Vectorized Search**: Uses `ChromaDB` and semantic embeddings to find documents that fulfill checklist requirements, even if the filenames are unconventional.
- **Relevance Scoring**: Assigns a confidence score to each match. If a match is weak, the system flags it for "Low Relevance" or "Missing."

### 5. Automated Classification
The system automatically organizes unorganized folders into the standard CTD hierarchy.
- **Module Detection**: Uses LLMs to analyze the first few pages of a document to determine if it belongs to Module 1 (Administrative), Module 3 (Quality), or Module 5 (Clinical).
- **SAE Classification**: Specifically for clinical reports (Module 5), it performs deep classification of **Seriousness**, **Priority**, **Causality**, and **Expectedness** for adverse events.
- **Duplicate Detection**: Identifies redundant case reports using similarity scoring to prevent double-counting of safety signals.

### 6. Intelligent Version Checking
Simplifies the review of resubmissions by focusing only on what has changed.
- **Delta Analysis**: Compares two versions of a dossier ZIP to identify added, deleted, or modified files based on filename basenames.
- **AI Content Descriptions**: For newly added files, the system generates a plain-language paragraph describing the document's content, allowing reviewers to understand the update without opening every file.

---

## Technologies and Models

### Backend
- Python 3.x
- FastAPI + Uvicorn for API serving
- LangChain for prompt orchestration and LLM workflows
- Transformers, Tokenizers, and Hugging Face Hub for model loading
- PyTorch, PEFT, Accelerate for model inference and LoRA adapters
- Sentence-Transformers for semantic embeddings
- ChromaDB for vector search and checklist similarity matching
- PDF and document processing libraries: PyMuPDF, pypdf, python-docx
- Data and utilities: pandas, numpy, scikit-learn, tqdm
- Azure Blob Storage integration and dotenv-based configuration

### Frontend
- React 19 + TypeScript
- Vite build system
- Tailwind CSS + PostCSS for styles
- React Router v7 for navigation
- react-pdf and docx-preview for document rendering
- JSZip for ZIP file handling
- Lucide icons for UI

### Models
- Transformer-based models via Hugging Face (inferred from `transformers`, `tokenizers`, `huggingface_hub`)
- Sentence embedding models via `sentence-transformers`
- Support for fine-tuning/inference with PEFT/LoRA adapters
- LLM-driven summarization, classification, and anonymization workflows

---

## Getting Started

### Backend

1. Open a terminal and navigate to the `Backend/` folder:
   ```bash
   cd Backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
3. Install the backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables by creating a `.env` file inside `Backend/`.
5. Run the backend server:
   ```bash
   python main.py
   ```

For more details, see `Backend/README.md`.

### Frontend

1. Open a terminal and navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```

For more details, see `frontend/README.md`.

---

## Notes

- The frontend expects the backend API to be running so it can fetch dossier analytics and processing results.
- The backend stores local ChromaDB indexes in `.chroma_ctd_checklist/` and may require model/configuration settings for LLM-backed features.
- Use the folder-specific `README.md` files for deeper implementation and architecture guidance.

---

## Useful Links

- `Backend/README.md` — Backend setup, architecture, and feature details
- `frontend/README.md` — Frontend setup, technology stack, and run commands
