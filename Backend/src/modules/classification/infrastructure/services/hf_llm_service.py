import json
import torch
from huggingface_hub import login
from transformers import AutoModelForCausalLM, AutoTokenizer

from ...core.config import settings


class HuggingFaceLLMService:
    """
    Hugging Face LLM service alternative for classification and CTD detection.
    """

    def __init__(self):
        if settings.HUGGINGFACE_TOKEN:
            login(token=settings.HUGGINGFACE_TOKEN)

        self.model_name = settings.HUGGINGFACE_MODEL
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            trust_remote_code=True,
        )

        if "70" in self.model_name or "72" in self.model_name:
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto",
                load_in_8bit=True,
                trust_remote_code=True,
            )
        else:
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto",
                trust_remote_code=True,
            )

    def _format_prompt(self, system_prompt: str, user_prompt: str) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        if hasattr(self.tokenizer, "apply_chat_template"):
            return self.tokenizer.apply_chat_template(messages, tokenize=False)
        if "mistral" in self.model_name.lower():
            return f"<s>[INST] {system_prompt}\n\n{user_prompt} [/INST]"
        if "llama" in self.model_name.lower():
            return (
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
                f"{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
                f"{user_prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
            )
        if "qwen" in self.model_name.lower():
            return (
                f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
                f"<|im_start|>user\n{user_prompt}<|im_end|>\n"
                "<|im_start|>assistant\n"
            )
        return f"{system_prompt}\n\n{user_prompt}"

    async def _generate_response(self, system_prompt: str, user_prompt: str, max_tokens: int = 2048) -> dict:
        prompt = self._format_prompt(system_prompt, user_prompt)
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=0.7,
                top_p=0.9,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        response_text = self.tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1]:],
            skip_special_tokens=True,
        ).strip()

        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            return {"error": "Failed to parse JSON", "raw_response": response_text}

    async def classification_map_chunk(self, chunk: dict) -> dict:
        system_prompt = """You are a clinical AI analyzing a document chunk.
Identify any SAE signals: Outcome (Death, Disability, Hospitalisation, or other), Adverse Event description, Drug info, and Patient details.
You MUST provide traceable outputs with EXACT citations."""
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            return {"error": str(e), "chunk_id": chunk["chunk_id"]}

    async def classification_reduce(self, partial_summaries: list, override_classification: dict = None) -> dict:
        from ...models.classification_schemas import ClassificationResponse

        json_schema = ClassificationResponse.model_json_schema()
        system_prompt = f"""You are a senior regulatory AI combining clinical signals from ONE SINGLE file.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', 'text_snippet', and 'explanation'.
3. Do NOT populate the `duplicate_detection` dictionary."""

        if override_classification:
            system_prompt += f"\n\nCRITICAL: Use this rule-based classification:\n{json.dumps(override_classification)}"

        user_prompt = f"Here are the clinical signals:\n{json.dumps(partial_summaries)}\n\nProduce the final classification JSON."
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            return {"error": str(e)}

    async def detect_ctd_module(self, document_sample: str, file_name: str) -> dict:
        system_prompt = """You are a regulatory affairs expert specializing in CTD (Common Technical Document) structure for pharmaceutical submissions.

Your task is to analyze document content and classify it into the correct CTD module:
- Module 1
- Module 2
- Module 3
- Module 4
- Module 5
- Unknown

Provide output in JSON format:
{
  "detected_module": "Module X",
  "confidence": "high/medium/low",
  "reasoning": "Brief explanation",
  "is_sae_applicable": true/false
}"""
        user_prompt = (
            f"Analyze the following document excerpt from file '{file_name}' "
            f"and classify into the appropriate CTD module:\n\n{document_sample}"
        )
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            return {
                "detected_module": "Unknown",
                "confidence": "low",
                "reasoning": f"Failed to detect module: {str(e)}",
                "is_sae_applicable": False,
            }


llm_service = HuggingFaceLLMService()
