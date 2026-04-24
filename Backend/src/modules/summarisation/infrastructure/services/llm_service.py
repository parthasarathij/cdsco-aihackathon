import json
import asyncio
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from ...core.config import settings
from ...models.schemas import FinalSummaryResponse
from src.utils.logger import get_logger
logger = get_logger(__name__)

# Maximum tokens for Mistral generation
MAX_TOKENS = 2048

# Global Mistral model and tokenizer (cached after first load)
_mistral_model = None
_mistral_tokenizer = None

def _load_mistral_model():
    """Load Mistral model and tokenizer (lazy loading on first use)."""
    global _mistral_model, _mistral_tokenizer
    
    if _mistral_model is not None and _mistral_tokenizer is not None:
        return _mistral_model, _mistral_tokenizer
    
    try:
        model_path = settings.LOCAL_MISTRAL_MODEL_PATH
        logger.info("Loading Mistral model: %s", model_path)
        
        # Load tokenizer
        _mistral_tokenizer = AutoTokenizer.from_pretrained(model_path)
        
        # Load model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _mistral_model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
        )
        if device == "cpu":
            _mistral_model = _mistral_model.to(device)
        
        logger.info("Mistral model loaded successfully on %s", device)
        return _mistral_model, _mistral_tokenizer
    except Exception as e:
        raise RuntimeError(f"Failed to load Mistral model: {e}")

def _mistral_infer(system_prompt: str, user_prompt: str) -> dict:
    """Synchronous Mistral inference (runs in thread pool when called via asyncio.to_thread)."""
    try:
        model, tokenizer = _load_mistral_model()
        device = next(model.parameters()).device
        
        # Prepare messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        
        # Format for Mistral using chat template
        formatted_prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        
        # Tokenize
        inputs = tokenizer(formatted_prompt, return_tensors="pt").to(device)
        
        # Generate
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=MAX_TOKENS,
                temperature=0.3,
                top_p=0.9,
                do_sample=False,
            )
        
        # Decode
        content = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        
        # Extract JSON from response
        try:
            # Try to find JSON in the response
            if "{" not in content:
                return {"error": "No JSON found in response", "raw_response": content[:200]}
            
            json_start = content.find("{")
            json_end = content.rfind("}") + 1
            json_str = content[json_start:json_end]
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning("JSON parse error: %s", e)
            return {"error": "Failed to parse JSON response", "raw_response": content[:200]}
            
    except Exception as e:
        logger.exception("Mistral inference error: %s", e)
        return {"error": str(e)[:100]}

class LLMService:
    def __init__(self):
        """Initialize Mistral service (model loaded on first use via lazy loading)."""
        logger.info("Initializing Mistral LLM Service")
        self.model_path = settings.LOCAL_MISTRAL_MODEL_PATH

    async def map_chunk(self, chunk: dict, task_type: str) -> dict:
        """
        Map Phase: Sends individual chunk to Mistral to get partial summary.
        Keeps trace of chunk_id and page.
        """
        system_prompt = f"""You are a regulatory document analyzer evaluating chunks of {task_type}.
Extract key information relevant to the regulatory final summary. You must maintain traceability.
Include EXACT citations. Provide output in JSON format with "key_findings" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet.
Return ONLY valid JSON, no other text."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in map_chunk: %s", e)
            return {"error": str(e), "chunk_id": chunk['chunk_id']}

    async def reduce_summaries(self, partial_summaries: list[dict], task_type: str) -> dict:
        """
        Reduce Phase: Combines all partial summaries into the final strict JSON structure.
        """
        json_schema = FinalSummaryResponse.model_json_schema()
        if "properties" in json_schema and "overall_summary" in json_schema["properties"]:
            del json_schema["properties"]["overall_summary"]
        
        system_prompt = f"""You are a senior regulatory AI combining partial document summaries into a final structured summary for {task_type}.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', and 'text_snippet' based precisely on the provided inputs.
3. Ensure no duplication and provide a consolidated, decision-ready output.
Return ONLY valid JSON, no other text."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the partial summaries:\n{combined_text}\n\nProduce the final aggregated summary JSON."

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in reduce_summaries: %s", e)
            return {"error": str(e)}

    async def generate_overall_summary(self, full_structured_summary: dict) -> dict:
        """
        Generates an overall summary dynamically AFTER the base summaries are created.
        """
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()

        system_prompt = f"""You are a senior regulatory AI. Your task is to generate a final 'overall_summary' based ONLY on the provided structured summary JSON. 
Do NOT hallucinate or bring in external knowledge. 

The overall_summary MUST be generated using ALL sections, but in a CONTROLLED way. Extract ONLY ONE key insight from each section:
- application_details -> context (drug + applicant + type)
- quality_summary -> quality/compliance (e.g., GMP, stability)
- bioequivalence_summary -> study outcome (bioequivalence result)
- regulatory_summary -> risks / deficiencies
- final_status -> final decision

DO NOT include multiple details from the same section.
ANTI-REPETITION RULES:
- Do NOT repeat the same idea in multiple sentences.
- Do NOT restate the final decision more than once.
- Avoid using multiple synonyms for the same concept.
- Each sentence must contain NEW information.
- Avoid descriptive or promotional language.

STRUCTURE (STRICT) - Generate EXACTLY 4 sentences for the value:
Sentence 1: Application context
Sentence 2: Key findings (quality + bioequivalence combined)
Sentence 3: Risks / deficiencies
Sentence 4: Final decision / recommendation

STYLE GUIDELINES:
- Use concise, direct language.
- Avoid redundancy and long sentences.
- Focus on decision-making relevance (e.g., "demonstrates bioequivalence" NOT "shows promising and strong evidence of bioequivalence").

You MUST provide output in exactly this JSON structure matching this schema:
{json.dumps(json_schema)}

Rules for 'confidence': Must be 'low', 'medium', or 'high'.
Rules for 'source':
- ONLY refer to top-level sections (e.g., 'application_details', 'quality_summary', 'bioequivalence_summary', 'regulatory_summary', 'final_status').
- DO NOT include page numbers, chunk_id, or raw text snippets.
- Include a brief reasoning for each referenced section.
Return ONLY valid JSON, no other text."""

        user_prompt = f"Here is the finalized structured summary. Please generate the overall_summary JSON field:\n\n{json.dumps(full_structured_summary)}"

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in generate_overall_summary: %s", e)
            return {"error": str(e)}

    async def sae_map_chunk(self, chunk: dict) -> dict:
        """
        SAE Map Phase: Extract SAE specific data points.
        """
        system_prompt = """You are a regulatory analyzer evaluating a document chunk for a Serious Adverse Event (SAE) case.
Extract patient details, drug details, adverse event specifics, outcome, and causality. Maintain strict traceability.
Include EXACT citations. Provide output in JSON format with a "key_findings" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet.
Return ONLY valid JSON, no other text."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in sae_map_chunk: %s", e)
            return {"error": str(e), "chunk_id": chunk['chunk_id']}

    async def sae_reduce_summaries(self, partial_summaries: list[dict]) -> dict:
        """
        SAE Reduce Phase: Combines SAE partial summaries into the final strict SAE JSON schema.
        """
        from ...models.sae_schemas import SAECaseWrapper
        json_schema = SAECaseWrapper.model_json_schema()
        
        # Ensure 'overall_summary' is not generated in the initial reduce phase
        if ("$defs" in json_schema and 
            "SAECaseDetails" in json_schema["$defs"] and
            "properties" in json_schema["$defs"]["SAECaseDetails"] and 
            "overall_summary" in json_schema["$defs"]["SAECaseDetails"]["properties"]):
            del json_schema["$defs"]["SAECaseDetails"]["properties"]["overall_summary"]
        
        system_prompt = f"""You are a senior regulatory AI combining partial findings from ONE SINGLE patient case document.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', and 'text_snippet' based precisely on the provided inputs.
3. Ensure no duplication and provide a consolidated, decision-ready output.
Return ONLY valid JSON, no other text."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the core SAE partial summaries:\n{combined_text}\n\nProduce the final aggregated SAE summary JSON."

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in sae_reduce_summaries: %s", e)
            return {"error": str(e)}

    async def generate_sae_overall_summary(self, full_structured_summary: dict) -> dict:
        """
        Generates an overall summary dynamically for an SAE case AFTER the base summaries are created.
        """
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()

        system_prompt = f"""You are a senior regulatory AI. Your task is to generate a final 'overall_summary' based ONLY on the provided SAE structured summary JSON. 
Do NOT hallucinate or bring in external knowledge or merge cases.

The overall_summary MUST be generated using ONLY the following sections:
- patient_details
- drug_details
- adverse_event
- outcome
- causality_assessment
- reporting_source

DO NOT include multiple details from the same section if it causes repetition.
ANTI-REPETITION RULES:
- Do NOT repeat the same idea.
- Do NOT restate the outcome multiple times.
- Each sentence must add NEW information.

STRUCTURE (STRICT) - Generate EXACTLY 4 sentences:
Sentence 1: Patient + drug context
Sentence 2: Adverse event description
Sentence 3: Outcome + action taken
Sentence 4: Causality + seriousness insight

STYLE GUIDELINES:
- Keep it concise and use clinical language.
- Avoid assumptions and hallucinations.

You MUST provide output in exactly this JSON structure matching this schema:
{json.dumps(json_schema)}

Rules for 'confidence': Must be 'low', 'medium', or 'high'.
Rules for 'source':
- ONLY refer to top-level sections (e.g., 'patient_details', 'drug_details', 'adverse_event', 'outcome', 'causality_assessment', 'reporting_source').
- DO NOT include page numbers, chunk_id, or raw text snippets.
- Include a brief reason for each referenced section.
Return ONLY valid JSON, no other text."""

        user_prompt = f"Here is the finalized SAE structured summary. Please generate the overall_summary JSON field:\n\n{json.dumps(full_structured_summary)}"

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in generate_sae_overall_summary: %s", e)
            return {"error": str(e)}

    async def meeting_map_chunk(self, chunk: dict) -> dict:
        """
        Meeting Map Phase: Extract meeting discussions, decisions, tasks.
        """
        system_prompt = """You are an executive AI assistant evaluating a chunk of a meeting transcript or document.
Extract agenda points, key discussions, decisions, action items, and participants.
You MUST maintain strict traceability. Include EXACT citations. Provide output in JSON format with a "key_findings" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet.
If it is an MP3 transcription, the page number simulated mathematically acts as your timestamp marker.
Return ONLY valid JSON, no other text."""
        
        user_prompt = f"Analyze the following meeting chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in meeting_map_chunk: %s", e)
            return {"error": str(e), "chunk_id": chunk['chunk_id']}

    async def meeting_reduce_summaries(self, partial_summaries: list[dict]) -> dict:
        """
        Meeting Reduce Phase: Combines Meeting partial summaries into the final strict JSON schema.
        """
        from ...models.meeting_schemas import MeetingWrapper
        json_schema = MeetingWrapper.model_json_schema()
        
        # Ensure 'overall_summary' is not generated in the initial reduce phase
        if ("$defs" in json_schema and 
            "MeetingSummaryDetails" in json_schema["$defs"] and
            "properties" in json_schema["$defs"]["MeetingSummaryDetails"] and 
            "overall_summary" in json_schema["$defs"]["MeetingSummaryDetails"]["properties"]):
            del json_schema["$defs"]["MeetingSummaryDetails"]["properties"]["overall_summary"]
        
        system_prompt = f"""You are a senior executive AI combining partial findings from ONE SINGLE meeting.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', and 'text_snippet' based precisely on the provided inputs.
3. Ensure no duplication. Produce a concise, decision-ready output.
Return ONLY valid JSON, no other text."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the meeting partial summaries:\n{combined_text}\n\nProduce the final aggregated meeting summary JSON."

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in meeting_reduce_summaries: %s", e)
            return {"error": str(e)}

    async def generate_meeting_overall_summary(self, full_structured_summary: dict) -> dict:
        """
        Generates an overall summary dynamically for a Meeting AFTER the base summaries are created.
        """
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()

        system_prompt = f"""You are a senior executive AI. Your task is to generate a final 'overall_summary' based ONLY on the provided Meeting structured summary JSON. 
Do NOT hallucinate or bring in external knowledge. Do NOT combine multiple meetings.

The overall_summary MUST be generated using ONLY the following sections:
- meeting_details
- agenda_summary
- key_discussions
- decisions
- action_items
- next_steps

DO NOT include multiple details from the same section if it causes repetition.
ANTI-REPETITION RULES:
- Do NOT repeat decisions.
- Do NOT restate same discussion points.
- Each sentence must add NEW information.

STRUCTURE (STRICT) - Generate EXACTLY 4 sentences:
Sentence 1: Meeting context (type + participants + purpose)
Sentence 2: Key discussions
Sentence 3: Decisions made
Sentence 4: Action items + next steps

STYLE GUIDELINES:
- Keep it concise.
- Focus on decisions and outcomes.
- Avoid unnecessary details.
- No hallucination.

You MUST provide output in exactly this JSON structure matching this schema:
{json.dumps(json_schema)}

Rules for 'confidence': Must be 'low', 'medium', or 'high'.
Rules for 'source':
- ONLY refer to top-level sections (e.g., 'meeting_details', 'agenda_summary', 'key_discussions', 'decisions', 'action_items', 'next_steps').
- DO NOT include page numbers, chunk_id, or raw text snippets.
- Include a brief reason for each referenced section.
Return ONLY valid JSON, no other text."""

        user_prompt = f"Here is the finalized Meeting structured summary. Please generate the overall_summary JSON field:\n\n{json.dumps(full_structured_summary)}"

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in generate_meeting_overall_summary: %s", e)
            return {"error": str(e)}

    async def classification_map_chunk(self, chunk: dict) -> dict:
        """
        Classification Map Phase: Extract raw clinical signals (Outcome, Adverse Event, Drug, Patient)
        """
        system_prompt = """You are a clinical AI analyzing a document chunk.
Identify any SAE signals: Outcome (Death, Disability, Hospitalisation, or other), Adverse Event description, Drug info, and Patient details.
You MUST provide traceable outputs. Include EXACT citations. Provide output in JSON format with a "clinical_signals" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet.
Return ONLY valid JSON, no other text."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in classification_map_chunk: %s", e)
            return {"error": str(e), "chunk_id": chunk['chunk_id']}

    async def classification_reduce(self, partial_summaries: list[dict], override_classification: dict = None) -> dict:
        """
        Classification Reduce Phase: Combines signals into the final ClassificationResponse schema.
        Accepts an optional override_classification generated by the Rule-Based Hybrid layer.
        """
        from ...models.classification_schemas import ClassificationResponse
        json_schema = ClassificationResponse.model_json_schema()
        
        system_prompt = f"""You are a senior regulatory AI combining clinical signals from ONE SINGLE file.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', 'text_snippet', and 'explanation'.
3. Do NOT populate the `duplicate_detection` dictionary (leave it empty/false). It is handled separately by the Python pipeline.
Return ONLY valid JSON, no other text."""
        
        if override_classification:
            system_prompt += f"\n\nCRITICAL INSTRUCTION: A primary Rule-Based engine has executed. You MUST use the following seriousness and priority:\n{json.dumps(override_classification)}"

        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the clinical signals:\n{combined_text}\n\nProduce the final classification JSON."

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error("Error in classification_reduce: %s", e)
            return {"error": str(e)}

llm_service = LLMService()
