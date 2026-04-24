from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class LlmVerdict:
    verdict: str 
    reason: str


class LocalLlamaReviewer:
    """
    Optional second-stage reviewer for borderline embedding matches.

    Uses a local HuggingFace-format Llama model (your `Llama-3.2-3B-Instruct/` folder works).
    """

    def __init__(self, model_path: str, *, max_new_tokens: int = 96):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch

        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto",
        )
        self.max_new_tokens = max_new_tokens

    def review(self, *, checklist_title: str, checklist_description: str, document_text_snippet: str) -> LlmVerdict:
        prompt = (
            "You are a strict regulatory dossier document matcher.\n"
            "Given a checklist item (title + description) and the first pages of a document, decide if the document matches.\n"
            "Rules:\n"
            "- If it clearly is the same document type/content => verdict = matched\n"
            "- If it seems related but not clearly the required document => verdict = partial_match\n"
            "- If it is unrelated => verdict = not_a_match\n"
            "Return ONLY valid JSON with keys: verdict, reason.\n\n"
            f"CHECKLIST_TITLE: {checklist_title}\n"
            f"CHECKLIST_DESCRIPTION: {checklist_description}\n\n"
            f"DOCUMENT_SNIPPET:\n{document_text_snippet}\n"
        )

        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
        out = self.model.generate(
            **inputs,
            max_new_tokens=self.max_new_tokens,
            do_sample=False,
            temperature=0.0,
        )
        text = self.tokenizer.decode(out[0], skip_special_tokens=True)

        # Take last JSON object from output
        start = text.rfind("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return LlmVerdict(verdict="partial_match", reason="LLM output did not contain JSON; keeping partial_match.")

        try:
            payload = json.loads(text[start : end + 1])
            verdict = str(payload.get("verdict", "")).strip()
            reason = str(payload.get("reason", "")).strip()
        except Exception:
            return LlmVerdict(verdict="partial_match", reason="LLM JSON parse failed; keeping partial_match.")

        if verdict not in {"matched", "partial_match", "not_a_match"}:
            verdict = "partial_match"
        if not reason:
            reason = "No reason provided."
        return LlmVerdict(verdict=verdict, reason=reason)

