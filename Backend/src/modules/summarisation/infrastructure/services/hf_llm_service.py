import json
import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from huggingface_hub import login
from ...core.config import settings
from src.utils.logger import get_logger
logger = get_logger(__name__)

class HuggingFaceLLMService:
    """
    Complete Hugging Face LLM Service for Regulatory Document Processing
    Supports all pipelines: Summarization, SAE, Meeting, Classification
    """
    
    def __init__(self):
        # Authenticate with Hugging Face
        if settings.HUGGINGFACE_TOKEN:
            login(token=settings.HUGGINGFACE_TOKEN)
            print("Logged into Hugging Face")
        
        # Model configuration
        self.model_name = settings.HUGGINGFACE_MODEL
        print(f"Loading model: {self.model_name}")
        
        # Determine device
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        
        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            trust_remote_code=True
        )
        
        # Load model with optimal settings for large models
        if "70" in self.model_name or "72" in self.model_name:
            # For 70B+ models, use 8-bit quantization to save memory
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto",
                load_in_8bit=True,  # Requires bitsandbytes
                trust_remote_code=True
            )
        else:
            # For smaller models (7B), load normally
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto",
                trust_remote_code=True
            )
        
        print(f"Model loaded successfully: {self.model_name}")
    
    def _format_prompt(self, system_prompt: str, user_prompt: str) -> str:
        """
        Format prompt according to model's chat template
        """
        # Apply chat template if available
        if hasattr(self.tokenizer, 'apply_chat_template'):
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            return self.tokenizer.apply_chat_template(messages, tokenize=False)
        else:
            # Fallback to manual formatting
            if "mistral" in self.model_name.lower():
                return f"<s>[INST] {system_prompt}\n\n{user_prompt} [/INST]"
            elif "llama" in self.model_name.lower():
                return f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n{user_prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
            elif "qwen" in self.model_name.lower():
                return f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{user_prompt}<|im_end|>\n<|im_start|>assistant\n"
            else:
                return f"{system_prompt}\n\n{user_prompt}"
    
    async def _generate_response(self, system_prompt: str, user_prompt: str, max_tokens: int = 2048) -> dict:
        """
        Generate response from Hugging Face model
        """
        prompt = self._format_prompt(system_prompt, user_prompt)
        
        # Tokenize
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=0.7,
                top_p=0.9,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
                eos_token_id=self.tokenizer.eos_token_id
            )
        
        # Decode
        response_text = self.tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:], 
            skip_special_tokens=True
        ).strip()
        
        # Try to parse as JSON
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            print(f"Warning: Failed to parse JSON response. Raw: {response_text[:200]}")
            return {"error": "Failed to parse JSON", "raw_response": response_text}
    
    # SUMMARIZATION PIPELINE METHODS
    
    async def map_chunk(self, chunk: dict, task_type: str) -> dict:
        """Map Phase for general document summarization"""
        system_prompt = f"""You are a regulatory document analyzer evaluating chunks of {task_type}.
Extract key information relevant to the regulatory final summary. You must maintain traceability.
Include EXACT citations. Provide output in JSON format with "key_findings" list containing objects with file, page (refer to the text header [FILE: name | PAGE: num]), and text_snippet."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF map_chunk: {e}")
            return {"error": str(e), "chunk_id": chunk['chunk_id']}
    
    async def reduce_summaries(self, partial_summaries: list, task_type: str) -> dict:
        """Reduce Phase for general document summarization"""
        from ...models.schemas import FinalSummaryResponse
        json_schema = FinalSummaryResponse.model_json_schema()
        if "properties" in json_schema and "overall_summary" in json_schema["properties"]:
            del json_schema["properties"]["overall_summary"]
        
        system_prompt = f"""You are a senior regulatory AI combining partial document summaries into a final structured summary for {task_type}.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. The 'source' objects must contain 'file', 'page', 'chunk_id', and 'text_snippet'.
3. Ensure no duplication and provide a consolidated, decision-ready output."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the partial summaries:\n{combined_text}\n\nProduce the final aggregated summary JSON."
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF reduce_summaries: {e}")
            return {"error": str(e)}
    
    async def generate_overall_summary(self, full_structured_summary: dict) -> dict:
        """Generate overall summary for general documents"""
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()
        
        system_prompt = f"""You are a senior regulatory AI. Generate a final 'overall_summary' based ONLY on the provided structured summary JSON.
Do NOT hallucinate. Extract ONE key insight from each section.
STRUCTURE (STRICT) - Generate EXACTLY 4 sentences:
Sentence 1: Application context
Sentence 2: Key findings (quality + bioequivalence combined)
Sentence 3: Risks / deficiencies
Sentence 4: Final decision / recommendation

You MUST provide output in exactly this JSON structure:
{json.dumps(json_schema)}"""
        
        user_prompt = f"Here is the finalized structured summary:\n\n{json.dumps(full_structured_summary)}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF generate_overall_summary: {e}")
            return {"error": str(e)}
    
    # SAE PIPELINE METHODS
    
    async def sae_map_chunk(self, chunk: dict) -> dict:
        """SAE Map Phase"""
        system_prompt = """You are a regulatory analyzer evaluating a document chunk for a Serious Adverse Event (SAE) case.
Extract patient details, drug details, adverse event specifics, outcome, and causality. Maintain strict traceability.
Include EXACT citations. Provide output in JSON format with a "key_findings" list."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF sae_map_chunk: {e}")
            return {"error": str(e), "chunk_id": chunk['chunk_id']}
    
    async def sae_reduce_summaries(self, partial_summaries: list) -> dict:
        """SAE Reduce Phase"""
        from ...models.sae_schemas import SAECaseWrapper
        json_schema = SAECaseWrapper.model_json_schema()
        
        system_prompt = f"""You are a senior regulatory AI combining partial summaries from ONE SINGLE patient case document.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. Ensure no duplication and provide a consolidated output."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the SAE partial summaries:\n{combined_text}\n\nProduce the final aggregated SAE summary JSON."
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF sae_reduce_summaries: {e}")
            return {"error": str(e)}
    
    async def generate_sae_overall_summary(self, full_structured_summary: dict) -> dict:
        """Generate overall summary for SAE cases"""
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()
        
        system_prompt = f"""You are a senior regulatory AI. Generate a final 'overall_summary' for an SAE case.
STRUCTURE (STRICT) - Generate EXACTLY 4 sentences:
Sentence 1: Patient + drug context
Sentence 2: Adverse event description
Sentence 3: Outcome + action taken
Sentence 4: Causality + seriousness insight

You MUST provide output in exactly this JSON structure:
{json.dumps(json_schema)}"""
        
        user_prompt = f"Here is the finalized SAE structured summary:\n\n{json.dumps(full_structured_summary)}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF generate_sae_overall_summary: {e}")
            return {"error": str(e)}
    
    # MEETING PIPELINE METHODS
    
    async def meeting_map_chunk(self, chunk: dict) -> dict:
        """Meeting Map Phase"""
        system_prompt = """You are an executive AI assistant evaluating a chunk of a meeting transcript.
Extract agenda points, key discussions, decisions, action items, and participants.
Maintain strict traceability with EXACT citations."""
        
        user_prompt = f"Analyze the following meeting chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF meeting_map_chunk: {e}")
            return {"error": str(e), "chunk_id": chunk['chunk_id']}
    
    async def meeting_reduce_summaries(self, partial_summaries: list) -> dict:
        """Meeting Reduce Phase"""
        from ...models.meeting_schemas import MeetingWrapper
        json_schema = MeetingWrapper.model_json_schema()
        
        system_prompt = f"""You are a senior executive AI combining partial findings from ONE SINGLE meeting.
You MUST return ONLY a JSON explicitly matching this JSON Schema:
{json.dumps(json_schema)}

Rules for XAI & Traceability:
1. Every field must have 'value', 'confidence' (low/medium/high), and 'source' (list).
2. Ensure no duplication. Produce a concise, decision-ready output."""
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the meeting partial summaries:\n{combined_text}\n\nProduce the final aggregated meeting summary JSON."
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF meeting_reduce_summaries: {e}")
            return {"error": str(e)}
    
    async def generate_meeting_overall_summary(self, full_structured_summary: dict) -> dict:
        """Generate overall summary for meetings"""
        from ...models.schemas import OverallSummary
        json_schema = OverallSummary.model_json_schema()
        
        system_prompt = f"""You are a senior executive AI. Generate a final 'overall_summary' for a meeting.
STRUCTURE (STRICT) - Generate EXACTLY 4 sentences:
Sentence 1: Meeting context (type + participants + purpose)
Sentence 2: Key discussions
Sentence 3: Decisions made
Sentence 4: Action items + next steps

You MUST provide output in exactly this JSON structure:
{json.dumps(json_schema)}"""
        
        user_prompt = f"Here is the finalized Meeting structured summary:\n\n{json.dumps(full_structured_summary)}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF generate_meeting_overall_summary: {e}")
            return {"error": str(e)}
    
    # CLASSIFICATION PIPELINE METHODS
    
    async def classification_map_chunk(self, chunk: dict) -> dict:
        """Classification Map Phase"""
        system_prompt = """You are a clinical AI analyzing a document chunk.
Identify any SAE signals: Outcome (Death, Disability, Hospitalisation, or other), Adverse Event description, Drug info, and Patient details.
You MUST provide traceable outputs with EXACT citations."""
        
        user_prompt = f"Analyze the following chunk (ID: {chunk['chunk_id']}):\n{chunk['text']}"
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF classification_map_chunk: {e}")
            return {"error": str(e), "chunk_id": chunk['chunk_id']}
    
    async def classification_reduce(self, partial_summaries: list, override_classification: dict = None) -> dict:
        """Classification Reduce Phase"""
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
        
        combined_text = json.dumps(partial_summaries)
        user_prompt = f"Here are the clinical signals:\n{combined_text}\n\nProduce the final classification JSON."
        
        try:
            return await self._generate_response(system_prompt, user_prompt)
        except Exception as e:
            print(f"Error in HF classification_reduce: {e}")
            return {"error": str(e)}

# Singleton instance
llm_service = HuggingFaceLLMService()