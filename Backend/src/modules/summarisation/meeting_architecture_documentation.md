# Meeting & Transcript Summarization Pipeline - Architecture & Flow

This document provides a clear, stage-by-stage breakdown of **Task 3: The Meeting & Transcript Summarization Pipeline**. Its fundamental goal is to take massive text or audio files (like Board Meeting transcripts, medical consultations, or corporate MP3 recordings) and mathematically convert them into a structured ledger of `Agenda Items`, `Key Discussions`, `Decisions`, and `Action Items`.

---

## High-Level Overview & The "Golden Rule"

Similar to the Serious Adverse Event (SAE) pipeline, corporate and medical meetings cannot have their data crossed. If an AI confuses an action item from "Q3 Budget Review" and assigns it into the "Clinical Trial Update" meeting summary, it creates disastrous administrative failures.

Therefore, this architecture strictly enforces the **DATA ISOLATION RULE**:
`One File = One Independent Meeting.`

If you upload 10 audio files or transcripts simultaneously, the system spins up parallel invisible containers. Data from `Meeting_A.mp3` will never be accessible or merged into the memory of `Meeting_B.doc`.

---

## Stage 1: File Ingestion (The API)

When a user opens the Swagger UI (`/docs`) and uploads multiple files to the `/meeting_summarize/` endpoint:
1. The server securely accepts all `.pdf`, `.doc`, `.docx`, and `.mp3` files.
2. It dumps the physical files temporarily into the `temp_uploads/` folder.
3. The API then bridges the files over to the **Meeting Summarization Pipeline Orchestrator**.

---

## Stage 2: The Data Isolation Wrapper (The Orchestrator)

In `app/services/meeting_pipeline.py`, the system creates isolated "threads" for every single file uploaded. 
Unlike the global combinations done in Task 1, Task 3 strictly dictates that the `_process_single_file()` loop traps the extraction, reading, and AI operations so they cannot breach file boundaries.

* `Meeting 1` goes through Extraction -> Chunking -> Map -> Reduce completely alone.
* `Meeting 2` goes through Extraction -> Chunking -> Map -> Reduce completely alone.

Once isolated execution finishes, they are neatly packaged into an Array (List) of JSON summaries.

---

## Stage 3: Semantic Text Extraction

Inside the isolation loop, the document is cracked open (`app/services/extraction_service.py`):

* **PDF / Word Docs**: The documents are read mathematically. The system associates the exact string of text to its specific `page_number` and `file_name`. 
* **Audio (.mp3)**: The server routes the raw stream to the **OpenAI Whisper Transcription model**, bypassing local hardware limits. The AI converts the spoken audio into a massive block of raw text. The application then automatically chunks the transcription into "pages" (blocks of 400 words) allowing us to simulate timestamps and page coordinates.

Every extracted page is sent to **Azure Blob Storage** systems to ensure legal compliance and audit logging.

---

## Stage 4: The Overlap Chunking Strategy

Because Meetings can last hours (often equating to dozens of transcript pages), an LLM cannot ingest the entire file at once without "forgetting" critical dialogue. The text is therefore chunked (`app/services/chunking_service.py`):
- `Chunk 1`: Pages 1 to 20
- `Chunk 2`: Pages 20 to 39 (Overlapping Page 20 ensures a sentence spoken at the page break doesn't lose context between computations).

Each chunk gets a unique ID tracker attached to it.

---

## Stage 5: The Map Phase (Meeting AI Extraction)

In `app/services/llm_service.py`, each chunk is independently parallel-processed through the OpenAI LLM. 
The AI is given a very specific identity: *"You are an executive AI assistant evaluating a chunk of a meeting."*

Instead of summarizing aimlessly, the AI is mathematically commanded to scan exactly for:
- Participants speaking or referenced.
- Specific Agenda Points covered.
- Rulings & Decisions.
- Action Items (What is the task, Who owns it, What is the deadline).

Since chunks are processed fully asynchronously at the exact same time, a 3-hour meeting transcript takes literal seconds to parse.

---

## Stage 6: The Reduce Phase (Strict JSON Structuring)

Once all chunks from a **single meeting file** are evaluated, the partial findings are compiled together and sent to the LLM one final time. 

The AI is commanded: *"You are a senior executive AI. Combine these partial findings into ONE final aggregated meeting summary."*
Crucially, the AI is mathematically constrained by a **Pydantic Validation Schema** (`app/models/meeting_schemas.py`). 

It cannot output conversational bloat. It must output programmatic JSON data matching the hierarchy built for Task 3 (`key_discussions`, `decisions`, `action_items`). We even built a specific `ArrayFieldResult` to force the AI to return `Participants` as a programmatic List of strings instead of a single string sentence.

---

## Stage 7: XAI (Explainable AI) & Auditability

You need to know exactly *when* or *where* a decision was made. 

Because we locked the `page_number` and `file_name` to the chunk during **Stage 3** and **Stage 4**, the final JSON output contains a strict `source` array attached to every single task or decision.

```json
"action_items": [
  {
    "task": {
      "value": "Finalize Q3 Budget and submit to CDSCO",
      "confidence": "high",
      "source": [
        {
          "file": "Q3_Review_Meeting.mp3",
          "page": 4,
          "chunk_id": "chunk_7f8a9b",
          "text_snippet": "Alright John, make sure the budget is finalized and submitted by Friday."
        }
      ]
    },
    "responsible_party": {
      "value": "John",
      "confidence": "high",
      "source": [...]
    },
    "deadline": {
      "value": "Friday",
      "confidence": "medium",
      "source": [...]
    }
  }
]
```

An executive or auditor can look at the generated Action Item, look at the `source`, pull open the recorded transcript to `Page 4` (or its rough audio equivalent marker), and verify the AI assigned the legal responsibility correctly.

---

## Stage 8: Auto-Cleanup

Once the final list of Meetings is packaged to be sent as the API Response, an emergency cleanup protocol fires in a `finally:` block. It securely deletes the `.pdf`, `.docx`, and `.mp3` files from the server's hard drive to preserve GDPR/HIPAA compliance standards and prevent unauthorized data retention on the container's disk.


prompt::

You are a senior AI systems engineer. Build a production-ready, scalable, and modular Meeting Summarization pipeline.

========================
🎯 OBJECTIVE
========================
Design an end-to-end system that:
- Accepts multiple meeting files (PDF, DOC, DOCX, MP3)
- Processes each file independently as a separate meeting
- Extracts discussions, decisions, and action items
- Handles large inputs using chunking
- Generates structured summaries with Explainable AI (XAI)

This is TASK 3: Meeting / Transcript Summarization.

========================
📥 INPUT REQUIREMENTS
========================
- Accept multiple files (single or batch)
- Supported formats:
  - PDF
  - DOC
  - DOCX
  - MP3

- Each file represents ONE meeting
- Files MUST NOT be merged

========================
🚫 STRICT DATA ISOLATION RULE
========================
- Each file MUST be processed independently
- One file = One meeting
- Data from one file MUST NEVER be used in another file’s summary

Processing Flow:
File A → chunks → summaries → final meeting A
File B → chunks → summaries → final meeting B

DO NOT:
- Merge files
- Combine summaries across meetings
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
- Preserve timestamps (VERY IMPORTANT)
- Segment into logical chunks

Store metadata:
- file_name
- page_number or timestamp
- raw_text

------------------------
STEP 2: CHUNKING
------------------------

- Chunk size: 20 pages or logical transcript segments
- Overlap rule:
  - Last segment of previous chunk included in next chunk

- Assign chunk_id
- Maintain mapping:
  chunk → file → page/timestamp

------------------------
STEP 3: MAP PHASE (CHUNK PROCESSING)
------------------------

- Each chunk processed independently
- Extract:
  - Agenda points
  - Key discussions
  - Decisions
  - Action items
  - Participants

- Attach metadata:
  - chunk_id
  - page/timestamp

------------------------
STEP 4: REDUCE PHASE (FINAL MEETING SUMMARY)
------------------------

- Combine chunk summaries ONLY within the same file
- Generate ONE final structured meeting summary

Ensure:
- No duplication
- Clear decisions
- Clear action ownership

========================
📤 OUTPUT REQUIREMENT
========================

- Output must be a LIST of meeting summaries
- Each file produces ONE JSON object
- Strict JSON only (no extra text)

FINAL STRUCTURE PER MEETING:

{
  "meeting": {
    "meeting_details": {
      "meeting_type": { "value": "", "confidence": "", "source": [] },
      "date": { "value": "", "confidence": "", "source": [] },
      "participants": { "value": [], "confidence": "", "source": [] }
    },

    "agenda_summary": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "key_discussions": [
      {
        "point": { "value": "", "confidence": "", "source": [] }
      }
    ],

    "decisions": [
      {
        "decision": { "value": "", "confidence": "", "source": [] },
        "decision_type": { "value": "", "confidence": "", "source": [] }
      }
    ],

    "action_items": [
      {
        "task": { "value": "", "confidence": "", "source": [] },
        "responsible_party": { "value": "", "confidence": "", "source": [] },
        "deadline": { "value": "", "confidence": "", "source": [] }
      }
    ],

    "next_steps": {
      "value": "",
      "confidence": "",
      "source": []
    },

    "overall_summary": {
      "value": "",
      "confidence": "",
      "source": []
    }
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
  "file": "file_name.mp3",
  "page": 5 OR "timestamp": "00:12:30",
  "chunk_id": "chunk_1",
  "text_snippet": "relevant sentence"
}

Ensure:
- Traceability: summary → chunk → source
- Evidence-backed decisions
- Timestamp-based traceability for audio

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
   - Reuse Task 1 and Task 2 pipeline
   - Only change template and extraction logic

3. Scalability:
   - Handle large transcripts
   - Support parallel processing per file

4. LLM Integration:
   - Respect token limits

5. Metadata Tracking:
   - Maintain:
     file → page/timestamp → chunk → summary mapping

========================
⚠️ EDGE CASE HANDLING
========================

- Missing participants
- Unclear speakers
- Overlapping discussions
- No clear decisions
- Incomplete transcripts

========================
📦 FINAL OUTPUT FORMAT
========================

Return:
[
  { meeting_summary_file_1 },
  { meeting_summary_file_2 }
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
