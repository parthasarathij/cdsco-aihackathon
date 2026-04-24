# Regulatory Document Summarization Pipeline - Architecture & Flow

This document provides a comprehensive, easy-to-understand breakdown of the **Document Summarization Pipeline**. Its purpose is to take massive, complex regulatory files (like 100+ page clinical trial PDFs or meeting audio recordings), read them, and generate structured summaries while ensuring **Explainable AI (XAI)**—meaning every generated fact can be traced back to the exact page or audio snippet it came from.

---

## High-Level Overview (The "Why")

Large Language Models (LLMs) like GPT-4 are incredibly smart, but they have a "token limit"—meaning they can only read a certain number of words at a time. You cannot feed a 500-page regulatory dossier into an LLM at once; it will either crash or "forget" the beginning of the document.

To solve this, this application uses a **Map-Reduce** architecture. We split massive documents into smaller "chunks," summarize each chunk independently (Map), and then combine all the partial summaries into one final, highly structured summary (Reduce).

Below is the stage-by-stage breakdown of what happens internally when a user uploads a file.

---

## Stage 1: File Ingestion (The API)

When a user opens the Swagger UI (`/docs`) and uploads files, the process begins here:
1. **The Endpoint (`app/api/endpoints/summarize.py`)**: The FastAPI server receives the uploaded files (`.pdf`, `.doc`, `.docx`, `.mp3`).
2. **Temporary Storage**: Because the libraries that process these files require physical files on the hard drive, the system temporarily saves these files to a `temp_uploads/` directory.
3. The server then triggers the **Summarization Pipeline Orchestrator** to begin processing the files. 

*(Note: In a massive scale production scenario, this step would send the job to a background queue like Celery, but here it runs directly).*

---

## Stage 2: Text Extraction (Converting to Text)

Next, the system must turn these varying file formats into a uniform format—plain text. This happens in `app/services/extraction_service.py`.

* **PDF Files**: The system reads the document page by page. It extracts the raw text and explicitly notes the `page_number` for every piece of text.
* **Word Documents (.doc / .docx)**: The system reads the document paragraph by paragraph, simulating page breaks so it can still track where the text was found.
* **Audio Files (.mp3)**: The system pipes the raw audio stream to the OpenAI Whisper Transcription model. The AI converts the spoken audio into a block of raw text. The application then artificially chops that raw text into "pages" of roughly 400 words each.
* **Azure Storage**: As each page is extracted, it is safely grouped and backed up to **Azure Blob Storage**. This prevents data loss and acts as an audit trail for the raw extracted text.

**Outcome of Stage 2**: A long list of "pages". Every page has three pieces of data: `file_name`, `page_number`, and `raw_text`.

---

## Stage 3: The Chunking Strategy

Now the system has, for instance, 100 pages of text. As mentioned, an LLM cannot process this safely all at once. This occurs in `app/services/chunking_service.py`.

1. **20-Page Grouping**: The system takes pages 1 through 20 and groups them into `Chunk 1`.
2. **The Overlap Rule**: To ensure the AI doesn't miss context that gets cut off between pages 20 and 21, the chunking overlaps by 1 page. 
   - `Chunk 1` = Pages 1 to 20
   - `Chunk 2` = Pages 20 to 39
   - `Chunk 3` = Pages 39 to 58
3. **Chunk Mapping**: Each chunk is given a unique ID (e.g., `chunk_a1b2c3d4`). The system creates a metadata map remembering exactly which file and which pages are inside this specific chunk.

---

## Stage 4: The Map Phase (Partial Summarization)

In `app/services/llm_service.py`, the system talks to the AI (OpenAI GPT-4o).

1. The system loops through all chunks created in Stage 3.
2. It says to the AI: *"You are a regulatory analyzer. Look at this chunk of text. Give me a partial summary of key findings, and you MUST cite the file name and page number for everything you find."*
3. Because chunks are independent of each other (Chunk 1 doesn't need to wait for Chunk 5 to finish processing), this is done **asynchronously**. The system processes all chunks at the exact same time, making the application incredibly fast. 

**Outcome of Stage 4**: If we had 100 pages (5 chunks), we now have 5 independent, partial JSON summaries. 

---

## Stage 5: The Reduce Phase (The Final Master Summary)

This is the most critical step, also handled in `app/services/llm_service.py`.

1. The system takes all 5 partial summaries and bundles them together into one large block of text.
2. It sends this bundle back to the AI with a strict prompt: *"You are a senior regulatory AI. Here are partial summaries combined from a massive document. Combine them into one final, perfect Master Summary. Remove any duplicate facts."*
3. **Strict JSON Formatting**: The AI is forced via a schema (`app/models/schemas.py`) to return output in an exact structure. It is not allowed to generate conversational text. It must generate exactly: Application Details, Quality Summary, Bioequivalence Summary, Regulatory Summary, and Final Status.

---

## Stage 6: Explainable AI (XAI) & Traceability

You cannot trust an AI blindly in medicine or regulatory compliance. The system ensures **Explainable AI (XAI)** throughout the entire final output. 

For every single fact generated in the final JSON, the AI provides three things:
1. `value`: The actual answer (e.g., "The drug is Ibuprofen").
2. `confidence`: low / medium / high (How sure the AI is about this fact).
3. `source`: An exact traceback highlighting where it learned this fact.
   ```json
   "source": [
     {
       "file": "clinical_trial.pdf",
       "page": 12,
       "chunk_id": "chunk_a1b2c3d4",
       "text_snippet": "The active pharmaceutical ingredient is Ibuprofen."
     }
   ]
   ```

Because we saved the exact chunk IDs and page numbers in **Stage 3**, and enforced the AI to cite them in **Stage 4** and **Stage 5**, a human auditor can instantly open up `clinical_trial.pdf`, scroll to page 12, and verify that the AI did not hallucinate.

---

## Stage 7: Cleanup

Finally, the `summarize_documents` endpoint automatically deletes all of the `.pdf`, `.mp3`, or `.docx` files from the temporary `temp_uploads` folder so your server does not run out of hard drive space. The final structured JSON is returned to the user's screen.










prompt i used:

You are a senior AI systems engineer. Build a production-ready, scalable, and modular document summarization pipeline for regulatory workflows.

========================
🎯 OBJECTIVE
========================
Design an end-to-end system that:
- Accepts multiple input file formats (PDF, DOC, DOCX, MP3)
- Extracts and processes large documents
- Handles LLM token limitations using chunking
- Generates structured, standardized summaries
- Provides Explainable AI (XAI) with traceability

This is TASK 1: Application Document Summarization.

The system must be reusable for:
- Task 2: SAE summarization
- Task 3: Meeting summarization

========================
📥 INPUT REQUIREMENTS
========================
- Accept multiple files (single or bulk upload)
- Supported formats:
  - PDF
  - DOC
  - DOCX
  - MP3

- Files may be large (100+ pages)

========================
⚙️ PROCESSING PIPELINE
========================

------------------------
STEP 1: TEXT EXTRACTION
------------------------

PDF / DOC / DOCX:
- Extract text page-wise
- DO NOT merge pages
- Preserve page structure

MP3:
- Convert speech to text
- Segment transcript into logical “page-like” chunks

Storage:
- Store extracted data in Azure Blob Storage
- Maintain metadata:
  - file_name
  - page_number
  - raw_text

------------------------
STEP 2: CHUNKING STRATEGY
------------------------

- Chunk size: 20 pages per chunk
- Overlap rule:
  - Last page of previous chunk must be included in next chunk

Example:
- Chunk 1: Pages 1–20
- Chunk 2: Pages 20–40
- Chunk 3: Pages 40–60

- Assign unique chunk_id
- Maintain mapping:
  chunk_id → file_name → page_numbers

------------------------
STEP 3: MAP PHASE (CHUNK SUMMARIZATION)
------------------------

- Each chunk is sent to LLM independently
- Generate structured partial summaries
- Preserve key regulatory insights
- Attach metadata:
  - chunk_id
  - page references

------------------------
STEP 4: REDUCE PHASE (FINAL SUMMARY)
------------------------

- Combine all chunk summaries
- Send combined summaries to LLM
- Generate ONE final structured summary

- Ensure:
  - No duplication
  - Consistent structure
  - Decision-ready output

========================
📤 OUTPUT FORMAT (STRICT)
========================

Return ONLY JSON. No extra text.

Each field must include:
- value
- confidence (low / medium / high)
- source (list of evidence)

FINAL STRUCTURE:

{
  "application_details": {
    "drug_name": { "value": "", "confidence": "", "source": [] },
    "applicant": { "value": "", "confidence": "", "source": [] },
    "dosage_form": { "value": "", "confidence": "", "source": [] },
    "strength": { "value": "", "confidence": "", "source": [] },
    "indication": { "value": "", "confidence": "", "source": [] },
    "application_type": { "value": "", "confidence": "", "source": [] }
  },
  "quality_summary": {
    "api_compliance": { "value": "", "confidence": "", "source": [] },
    "manufacturing_process": { "value": "", "confidence": "", "source": [] },
    "stability": { "value": "", "confidence": "", "source": [] },
    "key_quality_findings": { "value": "", "confidence": "", "source": [] }
  },
  "bioequivalence_summary": {
    "study_conducted": { "value": "", "confidence": "", "source": [] },
    "study_design": { "value": "", "confidence": "", "source": [] },
    "result": { "value": "", "confidence": "", "source": [] },
    "conclusion": { "value": "", "confidence": "", "source": [] }
  },
  "regulatory_summary": {
    "key_observations": { "value": "", "confidence": "", "source": [] },
    "deficiencies": { "value": "", "confidence": "", "source": [] },
    "risk_flags": { "value": "", "confidence": "", "source": [] },
    "compliance_status": { "value": "", "confidence": "", "source": [] }
  },
  "final_status": {
    "completeness": { "value": "", "confidence": "", "source": [] },
    "recommendation": { "value": "", "confidence": "", "source": [] },
    "review_confidence": { "value": "", "confidence": "", "source": [] }
  }
}

========================
🔍 XAI (EXPLAINABILITY REQUIREMENTS)
========================

Each field MUST include:

1. value:
   - Final summarized content

2. confidence:
   - low / medium / high

3. source:
   - List of references

Each source object must contain:
{
  "file": "file_name.pdf",
  "page": 12,
  "chunk_id": "chunk_2",
  "text_snippet": "exact sentence or relevant excerpt"
}

System must ensure:
- Traceability: summary → chunk → original page
- Evidence-backed outputs
- Auditability for regulatory use

========================
🏗️ DESIGN REQUIREMENTS
========================

1. Modular Architecture:
   - File ingestion module
   - Text extraction module
   - Chunking module
   - LLM processing module
   - Aggregation module
   - Output formatter

2. Reusability:
   - Same pipeline should support:
     - SAE summarization
     - Meeting summarization
   - Only templates change

3. Scalability:
   - Handle large documents
   - Support parallel chunk processing

4. LLM Integration:
   - Use OpenAI API via .env
   - Respect token limits via chunking

5. Metadata Tracking:
   - Maintain:
     file → page → chunk → summary mapping

========================
⚠️ EDGE CASE HANDLING
========================

- Empty pages
- Corrupt files
- Mixed content formats
- Very large files
- Missing sections in documents

========================
📦 DELIVERABLE EXPECTATION
========================

Provide:
- Full system design
- Clean modular implementation structure
- Data flow pipeline
- LLM interaction strategy

Do NOT provide explanations.
Build production-ready solution.