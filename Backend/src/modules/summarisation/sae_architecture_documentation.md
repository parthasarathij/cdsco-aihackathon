# Serious Adverse Event (SAE) Summarization Pipeline - Architecture & Flow

This document provides a clear, stage-by-stage breakdown of **Task 2: The SAE Case Narration Pipeline**. Its goal is to take massive text or audio files (like clinical trial PDFs or meeting MP3s) and convert each into a strictly formatted medical Serious Adverse Event (SAE) report.

---

## High-Level Overview & The "Golden Rule"

Unlike general document summarization, medical SAE processing is legally sensitive. If a patient experiences an adverse reaction, that specific event must be tied **only** to that specific patient. 

Therefore, this architecture enforces a **STRICT DATA ISOLATION RULE**:
`One File = One Independent SAE Case.`

If you upload 5 files at the same time, the system will process them in parallel, but it builds invisible walls around each file. It guarantees that a piece of data from `Patient_A.pdf` will never accidentally bleed into the summary generated for `Patient_B.mp3`. 

Here is exactly how the system processes data beneath the surface.

---

## Stage 1: File Ingestion (The API)

When a user opens the Swagger UI (`/docs`) and uploads multiple files to the `/sae_summarize/` endpoint:
1. The server securely catches all files (`.pdf`, `.doc`, `.docx`, `.mp3`).
2. It temporarily saves these physical files into a `temp_uploads/` folder.
3. The API then hands the list of saved files over to the **SAE Summarization Pipeline Orchestrator**.

---

## Stage 2: The Data Isolation Wrapper (The Orchestrator)

In `app/services/sae_pipeline.py`, the system creates isolated "workers" for every single file. 
Instead of tossing all file pages into a giant pool (which is what Task 1 does to combine contexts), Task 2 runs a completely isolated `_process_single_file()` loop. 

* `File A` goes through Extraction -> Chunking -> Map -> Reduce completely alone.
* `File B` goes through Extraction -> Chunking -> Map -> Reduce completely alone.

The system waits for all specific isolated runs to finish and then packages them securely into a neat `List` of outputs. 

---

## Stage 3: Medical Text Extraction

Within that isolated loop, the file is cracked open and turned into uniform text (`app/services/extraction_service.py`):

* **PDF / Word Docs**: The documents are read page by page. The system saves the exact string of text and binds it mathematically to its specific `page_number` and `file_name`. 
* **Audio (.mp3)**: The server pipes the raw audio stream securely to the **OpenAI Whisper Transcription model**. The AI converts the spoken audio into a massive block of raw text. The application then artificially chops that raw text into "pages" of roughly 400 words each. 

Every page is backed up to **Azure Blob Storage** system to ensure audit logs survive in the cloud.

---

## Stage 4: The Overlap Chunking Strategy

Because Large Language Models (LLMs) cannot memorize a 200-page medical file in a single prompt, the extracted text is bundled into bite-sized "chunks" (`app/services/chunking_service.py`):
- `Chunk 1`: Pages 1 to 20
- `Chunk 2`: Pages 20 to 39 (Notice how Page 20 overlaps? This ensures a sentence split between two pages doesn't lose context).

Each chunk gets a unique ID tracker. 

---

## Stage 5: The Map Phase (SAE-Specific Extraction)

In `app/services/llm_service.py`, each chunk is independently pushed to the OpenAI LLM. 
The AI is given a very specific identity: *"You are evaluating a document chunk for an SAE case."*

Instead of finding general knowledge, the AI is mathematically commanded to scan for:
- Patient Details (Age, Gender)
- Drug Details (Dosage, Indication, Causality)
- Adverse Event specifics (Onset, Seriousness)
- Reporting Source

Since chunks are processed fully asynchronously at the exact same time, the scanning process takes only seconds, even for massive 100-page case narratives.

---

## Stage 6: The Reduce Phase (Strict JSON Structuring)

Once all chunks from a **single file** are evaluated, the partial findings are glued together and sent to the LLM one final time. 

The AI is commanded: *"You are a senior regulatory AI. Combine these partial findings into ONE final aggregated SAE summary."*
Crucially, the AI is mathematically constrained by a **Pydantic Validation Schema** (`app/models/sae_schemas.py`). 

It cannot respond with a conversational block of text. It must output programmatic JSON data matching the massive hierarchy of the `SAECaseWrapper`, including regulatory flags like "Expectedness" and "Listedness." 

---

## Stage 7: XAI (Explainable AI) & Auditability

In the highly regulated world of pharmaceuticals, the AI must prove where it got its information. 

Because we locked the `page_number` and `file_name` to the chunk during **Stage 3** and **Stage 4**, the final JSON output contains a strict `source` array attached to every single fact.

```json
"suspected_drug": {
  "value": "Amoxicillin",
  "confidence": "high",
  "source": [
    {
      "file": "Patient_A_Case.pdf",
      "page": 4,
      "chunk_id": "chunk_7f8a9b",
      "text_snippet": "Patient reaction occurred minutes after 500mg Amoxicillin dosage."
    }
  ]
}
```

A human Data Auditor can simply look at the final summary, pull open `Patient_A_Case.pdf` to Page 4, and legally sign off on the AI's transcription accuracy.

---

## Stage 8: Auto-Cleanup

Once the final list of SAE Cases is packaged to be sent to the user's screen, the system triggers an emergency cleanup protocol in a `finally:` block. It securely scrubs the PDF, DOCX, and MP3 files from the server's hard drive so protected medical data is not leaked or abandoned in temporary storage.






You are a senior AI systems engineer. Build a production-ready, scalable, and modular SAE (Serious Adverse Event) summarization pipeline.

========================
🎯 OBJECTIVE
========================
Design an end-to-end system that:
- Accepts multiple files (PDF, DOC, DOCX, MP3)
- Processes each file independently as a separate SAE case
- Handles large documents using chunking
- Generates structured, standardized SAE summaries
- Provides Explainable AI (XAI) with traceability

This is TASK 2: SAE Case Narration Summarization.

========================
📥 INPUT REQUIREMENTS
========================
- Accept multiple files (single or batch upload)
- Supported formats:
  - PDF
  - DOC
  - DOCX
  - MP3

- Each file represents ONE independent SAE case
- Files MUST NOT be merged

========================
🚫 STRICT DATA ISOLATION RULE
========================
- Each file MUST be processed independently
- One file = One case
- Data from one file MUST NEVER be used in another file’s summary
- No cross-file context sharing

Processing Flow:
File A → chunks → summaries → final case A
File B → chunks → summaries → final case B

DO NOT:
- Merge chunks from different files
- Combine summaries across files
- Infer data using other files

========================
⚙️ PROCESSING PIPELINE
========================

------------------------
STEP 1: TEXT EXTRACTION
------------------------

PDF / DOC / DOCX:
- Extract text page-wise
- Maintain page separation

MP3:
- Convert speech to text (transcription)
- Segment into logical page-like chunks

Store metadata:
- file_name
- page_number
- raw_text

------------------------
STEP 2: CHUNKING
------------------------

- Chunk size: 20 pages
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
STEP 3: MAP PHASE (CHUNK-LEVEL PROCESSING)
------------------------

- Each chunk is processed independently using LLM
- Extract SAE-specific information:
  - Patient details
  - Drug details
  - Adverse event
  - Outcome
  - Causality

- Attach metadata:
  - chunk_id
  - page references

------------------------
STEP 4: REDUCE PHASE (FINAL CASE SUMMARY)
------------------------

- Combine chunk summaries ONLY within the same file
- Generate ONE final structured SAE summary per file

- Ensure:
  - No duplication
  - Complete case representation
  - Decision-ready output

========================
📤 OUTPUT REQUIREMENT
========================

- Output must be a LIST of case summaries
- Each file produces ONE JSON object
- Strict JSON only (no extra text)

FINAL STRUCTURE PER CASE:

{
  "case": {
    "case_id": { "value": "", "confidence": "", "source": [] },

    "patient_details": {
      "age": { "value": "", "confidence": "", "source": [] },
      "gender": { "value": "", "confidence": "", "source": [] },
      "medical_history": { "value": "", "confidence": "", "source": [] }
    },

    "drug_details": {
      "suspected_drug": { "value": "", "confidence": "", "source": [] },
      "indication": { "value": "", "confidence": "", "source": [] },
      "dosage": { "value": "", "confidence": "", "source": [] }
    },

    "adverse_event": {
      "event_description": { "value": "", "confidence": "", "source": [] },
      "event_onset": { "value": "", "confidence": "", "source": [] },
      "severity": { "value": "", "confidence": "", "source": [] },
      "seriousness": { "value": "", "confidence": "", "source": [] }
    },

    "outcome": {
      "result": { "value": "", "confidence": "", "source": [] },
      "action_taken": { "value": "", "confidence": "", "source": [] },
      "dechallenge_rechallenge": { "value": "", "confidence": "", "source": [] }
    },

    "causality_assessment": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "reporting_source": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "regulatory_flags": {
      "expectedness": { "value": "", "confidence": "", "source": [] },
      "listedness": { "value": "", "confidence": "", "source": [] },
      "risk_signal": { "value": "", "confidence": "", "source": [] }
    },

    "case_narrative_summary": {
      "value": "",
      "confidence": "",
      "source": []
    }
  }
}

========================
🔍 XAI (EXPLAINABILITY REQUIREMENTS)
========================

Each field MUST include:
- value → extracted or summarized information
- confidence → low / medium / high
- source → list of evidence references

Each source object must contain:
{
  "file": "file_name.pdf",
  "page": 12,
  "chunk_id": "chunk_2",
  "text_snippet": "relevant sentence from document"
}

System must ensure:
- Full traceability: summary → chunk → original page
- Evidence-backed output
- Auditability for regulatory workflows

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
   - Reuse Task 1 pipeline
   - Only change template and extraction logic

3. Scalability:
   - Handle large files efficiently
   - Support parallel processing per file

4. LLM Integration:
   - Ensure token-safe chunking

5. Metadata Tracking:
   - Maintain:
     file → page → chunk → summary mapping

========================
⚠️ EDGE CASE HANDLING
========================

- Missing patient details
- Multiple drugs in same case
- Multiple adverse events
- Incomplete or noisy data
- Corrupt or empty files

========================
📦 FINAL OUTPUT FORMAT
========================

Return:
[
  { case_summary_file_1 },
  { case_summary_file_2 },
  { case_summary_file_3 }
]

Each object corresponds to ONE file ONLY.

========================
DELIVERABLE
========================

Provide:
- Full system design
- Modular implementation structure
- Data pipeline
- LLM interaction strategy

Do NOT explain — directly build solution.