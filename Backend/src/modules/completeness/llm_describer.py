from __future__ import annotations
from src.utils.logger import get_logger

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


@dataclass(frozen=True)
class LlmDocumentDescription:
    document_type: str
    regulatory_anchor: str | None
    purpose_and_contents: str
    key_evidence: list[str]

    def to_dict(self) -> dict:
        return {
            "document_type": self.document_type,
            "regulatory_anchor": self.regulatory_anchor,
            "purpose_and_contents": self.purpose_and_contents,
            "key_evidence": self.key_evidence,
        }


def build_query_text(llm_output: dict) -> str:
    parts = []
    if llm_output.get("document_type"):
        parts.append(llm_output["document_type"])
    if llm_output.get("regulatory_anchor"):
        parts.append(llm_output["regulatory_anchor"])
    if llm_output.get("purpose_and_contents"):
        parts.append(llm_output["purpose_and_contents"])
    if llm_output.get("key_evidence"):
        parts.append(". ".join(llm_output["key_evidence"]))
    return " | ".join(parts)


class LocalLlamaDescriber:
    """
    Local Llama model describer for dossier documents using transformers.
    
    Uses meta-llama/Llama-3.1-8B-Instruct model.

    Produces a description (not a checklist verdict). That description is then embedded
    with `all-MiniLM-L6-v2` and used to query Chroma.
    """

    def __init__(
        self,
        model_path: str,
        *,
        max_new_tokens: int = 220,
        snippet_max_chars: int = 6000,
    ):
        _root = Path(__file__).resolve().parent.parent.parent
        _env = _root / ".env"
        if _env.exists():
            load_dotenv(_env, encoding="utf-8-sig")
        load_dotenv(encoding="utf-8-sig")
        
        # Use local model path from config or env
        self.model_path = os.getenv("LOCAL_LLM_MODEL_PATH") or model_path or "meta-llama/Llama-3.1-8B-Instruct"
        self.max_new_tokens = max_new_tokens
        self.snippet_max_chars = snippet_max_chars
        
        # Initialize Llama model with transformers
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torch
            
            # Use GPU if available, fallback to CPU
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_path,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
            )
            if self.device == "cpu":
                self.model = self.model.to(self.device)
                
        except ImportError as e:
            raise RuntimeError(f"Required package not installed: {e}. Install transformers and torch.")
        except Exception as e:
            raise RuntimeError(f"Failed to load Llama model from {self.model_path}: {e}")

    def describe(self, *, snippet_text: str) -> LlmDocumentDescription:
        snippet = (snippet_text or "").strip()[: self.snippet_max_chars]

        system_prompt = """You are a regulatory affairs specialist reviewing a document submitted in a CDSCO CTD dossier.

Analyze the extracted text below and produce a single structured JSON object describing this document
in the style used in Indian regulatory dossier checklists.

The description must follow this exact pattern:
- Start with what TYPE of document it is (e.g. "Statutory form", "Formal letter", "Scientific report", "Draft labelling document")
- State the REGULATORY OR LEGAL ANCHOR if visible (e.g. "under the Drugs and Cosmetics Act, 1940", "as per ICH Q1A", "per Schedule Y")
- State WHO produces or submits it and FOR WHAT PURPOSE
- List the KEY CONTENT ELEMENTS actually present in the document (tests, sections, data types, parameters)
- Be specific — use the actual drug name, study type, or parameter names if visible in the text
- Do NOT use vague phrases like "this document covers" or "information about"
- Length: 2-4 sentences maximum

CRITICAL RULES — you must follow these exactly:
1. Do NOT include any drug substance name, drug product name, or brand name.
2. Do NOT include any company name, applicant name, manufacturer name, or facility address.
3. Do NOT include any country-specific directive, regulation number, or jurisdiction reference.
4. DO use only generic CTD/ICH structural vocabulary.
5. The description must be reusable and applicable to any drug submission, not just this one.
6. For regulatory_anchor, only include ICH guideline codes (e.g. "as per ICH Q2(R2)", "as per ICH S7A/S7B") or leave it null.

Return ONLY valid JSON with these exact keys:
{
  "document_type": "<one phrase — e.g. 'Stability study report', 'Statutory application form'>",
  "regulatory_anchor": "<applicable guideline, Act, or Rule — or null if not visible>",
  "purpose_and_contents": "<2-4 sentence description in the style described above>",
  "key_evidence": ["<specific item 1>", "<specific item 2>", ...]
}"""

        user_prompt = f"""Extracted text:
\"\"\"
{snippet}
\"\"\"

Provide the JSON output:"""

        try:
            # Prepare messages for Llama
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            
            # Format for Llama using chat template
            formatted_prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
            
            # Tokenize
            inputs = self.tokenizer(formatted_prompt, return_tensors="pt").to(self.device)
            
            # Generate
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=self.max_new_tokens,
                    temperature=0.2,
                    top_p=0.9,
                    do_sample=False,
                )
            
            # Decode
            text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract JSON from response
            start = text.rfind("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                # Fallback: treat as empty description
                return LlmDocumentDescription(
                    document_type="",
                    regulatory_anchor=None,
                    purpose_and_contents="",
                    key_evidence=[],
                )

            json_str = text[start : end + 1]
            payload = json.loads(json_str)

        except Exception as e:
            import logging
            logger = get_logger(__name__)
            logger.warning(f"Llama inference failed: {e}")
            return LlmDocumentDescription(
                document_type="",
                regulatory_anchor=None,
                purpose_and_contents="",
                key_evidence=[],
            )

        # Parse response
        document_type = str(payload.get("document_type", "")).strip()
        regulatory_anchor_raw = payload.get("regulatory_anchor")
        regulatory_anchor = None
        if regulatory_anchor_raw is not None:
            s_anchor = str(regulatory_anchor_raw).strip()
            if s_anchor and s_anchor.lower() != "null":
                regulatory_anchor = s_anchor
        purpose_and_contents = str(payload.get("purpose_and_contents", "")).strip()
        key_evidence_raw = payload.get("key_evidence", [])
        key_evidence: list[str] = []
        if isinstance(key_evidence_raw, list):
            for e in key_evidence_raw:
                if e is None:
                    continue
                s = str(e).strip()
                if s:
                    key_evidence.append(s)

        return LlmDocumentDescription(
            document_type=document_type,
            regulatory_anchor=regulatory_anchor,
            purpose_and_contents=purpose_and_contents,
            key_evidence=key_evidence[:8],
        )

