# SAE Case Classification Pipeline - Architecture & Flow

This document provides a comprehensive, stage-by-stage breakdown of **Task 4: The SAE Hybrid Classification Pipeline**. Its primary purpose is to automatically transform massive unstructured clinical data (PDFs or dictation MP3s) into an immediately actionable triage ticket—detecting duplicates, assigning legal severity, and ranking emergency priority using both determinative programming logic and AI inference.

---

## High-Level Overview & Strict Data Isolation

Just like in the SAE Case Narration task (Task 2), this algorithm strictly observes the **DATA ISOLATION RULE**:
`One File = One Independent Medical Case.`

If multiple cases are analyzed simultaneously, the pipeline traps each file's data inside its own execution memory. This explicitly guarantees that symptoms from `File A` are mathematically prevented from influencing the severity classification assigned to `File B`.

---

## Stage 1: File Ingestion (The API)

When a medical worker uploads files to the `/classify/` endpoint:
1. The server accepts `.pdf`, `.doc`, `.docx`, and `.mp3` formats.
2. These files are saved locally to `temp_uploads/`.
3. The API hands the roster of cases over to the **Classification Pipeline Orchestrator**.

---

## Stage 2: The Data Isolation Wrapper (The Orchestrator)

In `app/services/classification_pipeline.py`, the system establishes impenetrable firewalls for every individual file. 
The system does not process them simultaneously; rather, it uses parallel looping (`_process_single_file()`).

* `Case X` undergoes Extraction -> Map -> Hybrid Rule -> Reduce -> DupCheck completely alone.
* `Case Y` undergoes Extraction -> Map -> Hybrid Rule -> Reduce -> DupCheck completely alone.

Once isolated execution finishes, they are outputted cleanly as an Array of JSONs.

---

## Stage 3: Medical Text Extraction

Inside the isolated loop, the raw payload is unlocked (`app/services/extraction_service.py`):

* **PDF / Word Docs**: The documents are read systematically. The system permanently associates the parsed text string to its specific `page_number` and `file_name`. 
* **Audio (.mp3)**: The server routes the dictation stream natively to the **OpenAI Whisper Transcription model**, avoiding unstable OS-level installations. Whisper translates the audio into raw text, which the system mathematically splices into virtual "pages" (blocks of 400 words) allowing the AI to cite physical coordinates for an MP3 file.

---

## Stage 4: The Core Chunking Strategy

Clinical records can exceed hundreds of pages. Because LLMs have "token windows", they cannot analyze the entire timeline natively without data loss. The text is therefore fractioned (`app/services/chunking_service.py`):
- `Chunk 1`: Pages 1 to 20
- `Chunk 2`: Pages 20 to 39 (Overlap prevents a sentence carrying critical medical data from being abruptly severed between chunks).

Each chunk gets a unique tracking ID string.

---

## Stage 5: The Map Phase (Clinical Signal Sweep)

In `app/services/llm_service.py`, each chunk is launched to the OpenAI LLM in parallel. 
The AI operates with an explicit directive: *"You are a clinical AI extracting SAE Signals."*

It ignores generic dialogue and sweeps the chunk extracting ONLY:
- Legal Outcomes (e.g., Death, Hospitalization)
- Adverse Event details
- Drug identification
- Identifiable Patient characteristics

---

## Stage 6: The Hybrid Layer (Python Rule-Based Checking)

This is what makes Task 4 fundamentally different from the others. We cannot blindly trust an AI to dictate a legal Priority metric.

Before returning to the AI, **Python code intervenes and sweeps the partial summaries directly**. 
In `classification_pipeline.py`, the Python code explicitly parses for deterministic vocabulary tags in the text:
* If Python detects `death`, `fatal`, `disability`, or `disabled`, Python legally overrides the AI and permanently forces `seriousness: Death/Disability` and `priority: High`. The output source is stamped as **"Rule-Based"**.
* If it detects `hospitalization` or `admitted`, it forces Medium priority.
* If Python finds nothing conclusive, it legally hands jurisdiction back to the LLM.

---

## Stage 7: The Reduce Phase (LLM Refinement & Traceability)

The partial findings are now bundled and sent back to the LLM along with Python's Rule-Based demands for formatting.

The AI is commanded: *"You are a senior regulatory AI. Assemble this Classification Schema."*
Crucially, the AI is mathematically restrained by the Pydantic JSON structure (`app/models/classification_schemas.py`). 

In addition to formatting, the AI applies **Explainable AI (XAI)**. If it classifies a case as "High" priority, it must mathematically provide the `source` (e.g., `Patient_File.pdf | Page 6 | chunk_id: 28B`) and provide an attached `"explanation": "Why this supports classification"`.

---

## Stage 8: Duplicate Detection Cache

Before the JSON is delivered to the user, the module executes a memory sweep.

A top-level registry variable (`classified_cases_registry`) acts as runtime persistent memory. 
When `File B` finishes generating its medical signature, Python checks if its mathematical semantic signature matches `File A`'s cached array. If they match, `File B` dynamically flags itself as `is_duplicate: True` and generates a `"similarity_score": 0.95`, alongside identifying that it is a duplicate of `File A`.

---

## Stage 9: Auto-Cleanup

Once the final array of Classified Cases is bundled to be returned as an API Response, the `finally:` block executes to violently scrub the `.pdf`, `.docx`, and `.mp3` files from the API's `temp_uploads` folder to absolutely prevent HIPAA/GDPR clinical data leaks on the server's hard drive.


prompt:

You are a senior AI systems engineer. Build a production-ready, scalable classification system for SAE (Serious Adverse Event) cases directly from raw input files.

========================
🎯 OBJECTIVE
========================
Design an end-to-end system that:
- Accepts raw files (PDF, DOC, DOCX, MP3)
- Processes each file independently as a separate SAE case
- Extracts relevant information
- Classifies cases based on severity
- Detects duplicates
- Assigns priority levels
- Provides Explainable AI (XAI) outputs

========================
📥 INPUT REQUIREMENTS
========================
- Accept multiple files (single or batch upload)
- Supported formats:
  - PDF
  - DOC
  - DOCX
  - MP3

- Each file represents ONE independent case
- Files MUST NOT be merged

========================
🚫 STRICT DATA ISOLATION RULE
========================
- Each file MUST be processed independently
- One file = One case
- Data from one file MUST NEVER be used in another file’s classification

Processing Flow:
File A → extraction → chunks → classification → output A
File B → extraction → chunks → classification → output B

DO NOT:
- Merge files
- Combine chunks across files
- Share context across files

========================
⚙️ PROCESSING PIPELINE
========================

------------------------
STEP 1: TEXT EXTRACTION
------------------------

PDF / DOC / DOCX:
- Extract text page-wise
- Preserve page structure

MP3:
- Convert speech to text (transcription)
- Preserve timestamps

Store metadata:
- file_name
- page_number or timestamp
- raw_text

------------------------
STEP 2: CHUNKING
------------------------

- Chunk size: 20 pages or logical segments
- Overlap rule:
  - Last page/segment of previous chunk included in next chunk

- Assign chunk_id
- Maintain mapping:
  chunk → file → page/timestamp

------------------------
STEP 3: MAP PHASE (CHUNK-LEVEL ANALYSIS)
------------------------

For each chunk:
- Extract relevant signals:
  - Outcome (death, hospitalization, etc.)
  - Adverse event description
  - Drug information
  - Patient details (if available)

- Store intermediate signals with metadata

------------------------
STEP 4: REDUCE PHASE (FILE-LEVEL AGGREGATION)
------------------------

- Combine all chunk-level signals within the SAME file
- Create a unified case representation

Ensure:
- No duplication
- No loss of critical signals

------------------------
STEP 5: HYBRID CLASSIFICATION
------------------------

Apply classification using:

A) Rule-Based Logic (Primary)

Severity:
- Death → "Death"
- Disability → "Disability"
- Hospitalisation → "Hospitalisation"
- Else → "Others"

Priority:
- Death / Disability → High
- Hospitalisation → Medium
- Others → Low

B) LLM-Based Refinement (Secondary)

Use LLM when:
- Signals are unclear
- Conflicting information
- Missing outcome

LLM should:
- Infer severity
- Justify reasoning

------------------------
STEP 6: DUPLICATE DETECTION
------------------------

- Compare current file with existing processed cases
- Use:
  - Patient similarity
  - Drug similarity
  - Event similarity
  - Text similarity (semantic)

Output:
- is_duplicate
- duplicate_of
- similarity_score

========================
📤 OUTPUT FORMAT (STRICT)
========================

Return ONLY JSON. No extra text.

{
  "file_name": "",

  "classification": {
    "seriousness": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "priority": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "classification_source": "",

    "causality": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "expectedness": {
      "value": "",
      "confidence": "",
      "source": []
    }
  },

  "duplicate_detection": {
    "is_duplicate": false,
    "duplicate_of": "",
    "similarity_score": 0.0,
    "reason": ""
  },

  "regulatory": {
    "alert_flag": "",
    "regulatory_action": ""
  }
}

========================
🔍 XAI REQUIREMENTS
========================

Each field MUST include:
- value
- confidence (low / medium / high)
- source (list)

Each source object:
{
  "file": "file_name.pdf",
  "page": 10 OR "timestamp": "00:12:30",
  "chunk_id": "chunk_1",
  "text_snippet": "relevant sentence",
  "explanation": "why this supports classification"
}

Ensure:
- Full traceability: classification → chunk → original text
- Evidence-backed reasoning

========================
🏗️ DESIGN REQUIREMENTS
========================

1. Modular Architecture:
   - File ingestion module
   - Text extraction module
   - Chunking module
   - Signal extraction module
   - Classification module
   - Output formatter

2. Reusability:
   - Can integrate with summarization pipeline
   - Works independently if needed

3. Scalability:
   - Handle large files
   - Parallel processing per file

4. Consistency:
   - Same input → same output

========================
⚠️ EDGE CASES
========================

- Missing outcome data
- Multiple adverse events
- Multiple drugs
- Incomplete documents
- No clear severity indicators

========================
📦 FINAL OUTPUT
========================

Return:
[
  { classification_file_1 },
  { classification_file_2 }
]

Each output corresponds to ONE file ONLY.

========================
DELIVERABLE
========================

Provide:
- System design
- Modular implementation
- Data pipeline
- LLM interaction strategy

