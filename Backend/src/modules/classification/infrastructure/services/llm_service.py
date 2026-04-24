import json
import asyncio
import logging
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from ...core.config import settings
from ...models.classification_schemas import ClassificationResponse

logger = logging.getLogger(__name__)

# Fixed model as requested (no OpenAI usage)
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.3"
MAX_TOKENS = 2048
_mistral_model = None
_mistral_tokenizer = None


def _load_mistral_model():
    global _mistral_model, _mistral_tokenizer

    if _mistral_model is not None and _mistral_tokenizer is not None:
        return _mistral_model, _mistral_tokenizer

    model_name = settings.HUGGINGFACE_MODEL or MODEL_NAME
    logger.info("Loading classification model: %s", model_name)
    _mistral_tokenizer = AutoTokenizer.from_pretrained(model_name)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    _mistral_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        device_map="auto" if device == "cuda" else None,
    )
    if device == "cpu":
        _mistral_model = _mistral_model.to(device)
    return _mistral_model, _mistral_tokenizer


def _extract_json(text: str) -> dict:
    if "{" not in text:
        return {"error": "No JSON found in model response", "raw_response": text[:400]}
    start = text.find("{")
    end = text.rfind("}") + 1
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return {"error": "Failed to parse JSON response", "raw_response": text[:400]}


def _mistral_infer(system_prompt: str, user_prompt: str) -> dict:
    try:
        model, tokenizer = _load_mistral_model()
        device = next(model.parameters()).device

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = tokenizer(prompt, return_tensors="pt").to(device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=MAX_TOKENS,
                temperature=0.2,
                top_p=0.9,
                do_sample=False,
            )

        input_len = inputs["input_ids"].shape[1]
        content = tokenizer.decode(outputs[0][input_len:], skip_special_tokens=True).strip()
        return _extract_json(content)
    except Exception as e:
        logger.error("Mistral inference error: %s", e)
        return {"error": str(e)}


class LLMService:
    def __init__(self):
        self.model = settings.HUGGINGFACE_MODEL or MODEL_NAME

    async def classification_map_chunk(self, chunk: dict) -> dict:
        """
        Extract clinical signals for SAE classification from a single document chunk.
        """
        system_prompt = """You are a clinical AI analyzing a document chunk.
Identify any SAE signals: Outcome (Death, Disability, Hospitalisation, or other), Adverse Event description, Drug info, and Patient details.
You MUST provide traceable outputs. Include EXACT citations. Provide output in JSON format with a "clinical_signals" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet.
"""
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error(f"Error in classification_map_chunk for chunk {chunk.get('chunk_id')}: {e}")
            return {"error": str(e), "chunk_id": chunk['chunk_id']}

    async def classification_reduce(self, partial_summaries: list[dict], override_classification: dict = None) -> dict:
        """
        Aggregate clinical signals into a final classification JSON.
        """
        json_schema = ClassificationResponse.model_json_schema()
        
        system_prompt = f"""You are a senior regulatory AI combining clinical signals from ONE SINGLE file.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', 'text_snippet', and 'explanation'.
3. Do NOT populate the `duplicate_detection` dictionary (leave it empty/false). It is handled separately by the Python pipeline.
4. IMPORTANT: In the `classification` object, besides the required fields (seriousness, priority, causality, expectedness), also extract the following into their respective fields if found:
   - case_id: The formal SAE report or case ID
   - suspected_drug: The name of the drug suspected to cause the SAE
   - event_description: A concise clinical description of the adverse event
   - outcome: The final outcome of the event (e.g., Recovered, Fatal, Continuing)
   - patient_age: Age of the patient
   - patient_gender: Gender of the patient
   - reporter: The name or role of the person reporting the event
   - event_onset: When the event started relative to drug administration
   - case_narrative: A concise summary of the ENTIRE report/case (not only adverse event text). Include key context, timeline, treatment, outcome, and important negatives when available.
"""
        
        if override_classification:
            system_prompt += f"\n\nCRITICAL INSTRUCTION: A primary Rule-Based engine has executed. You MUST use the following seriousness and priority:\n{json.dumps(override_classification)}"

        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the clinical signals:\n{combined_text}\n\nProduce the final classification JSON."

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
        except Exception as e:
            logger.error(f"Error in classification_reduce: {e}")
            return {"error": str(e)}

    async def detect_ctd_module(self, document_sample: str, file_name: str) -> dict:
        """
        Detect which CTD module the document belongs to and whether SAE classification applies.
        """
        system_prompt = """You are a regulatory document classifier for CTD modules.
Classify the document into one of: Module 1, Module 2, Module 3, Module 4, Module 5, Unknown.
Return JSON with keys:
- detected_module (string)
- confidence (low|medium|high)
- reasoning (short string)
- is_sae_applicable (boolean; true only when SAE classification is relevant, usually Module 5)
"""
        user_prompt = (
            f"File: {file_name}\n\n"
            f"Document sample:\n{document_sample[:4000]}\n\n"
            "Return only JSON."
        )

        try:
            loop = asyncio.get_event_loop()
            parsed = await loop.run_in_executor(None, _mistral_infer, system_prompt, user_prompt)
            detected_module = parsed.get("detected_module", "Unknown")
            confidence = parsed.get("confidence", "low")
            reasoning = parsed.get("reasoning", "")
            is_sae_applicable = bool(
                parsed.get("is_sae_applicable", detected_module == "Module 5")
            )
            return {
                "detected_module": detected_module,
                "confidence": confidence,
                "reasoning": reasoning,
                "is_sae_applicable": is_sae_applicable,
            }
        except Exception as e:
            logger.error(f"Error in detect_ctd_module: {e}")
            # Fail-open so classification still runs instead of crashing.
            return {
                "detected_module": "Unknown",
                "confidence": "low",
                "reasoning": f"CTD module detection failed: {str(e)}",
                "is_sae_applicable": True,
            }

llm_service = LLMService()
