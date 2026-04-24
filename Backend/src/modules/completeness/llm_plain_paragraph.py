from __future__ import annotations
from src.utils.logger import get_logger

import os
import time
from pathlib import Path

from dotenv import load_dotenv


def describe_document_plain_paragraph(
    *,
    snippet_text: str,
    model_name: str,
    max_input_chars: int = 14_000,
    max_output_tokens: int = 1024,
) -> str:
    """
    Produce one plain-language paragraph summarizing dossier document text.

    Uses local Llama inference with transformers library.
l.
    """
    _root = Path(__file__).resolve().parent.parent.parent
    _env = _root / ".env"
    if _env.exists():
        load_dotenv(_env, encoding="utf-8-sig")
    load_dotenv(encoding="utf-8-sig")

    # Use local model from config
    model_path = os.getenv("LOCAL_LLM_MODEL_PATH") or model_name or "meta-llama/Llama-3.1-8B-Instruct"
    
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch
        
        # Initialize model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
        )
        if device == "cpu":
            model = model.to(device)
            
    except ImportError as e:
        raise RuntimeError(f"Required package not installed: {e}. Install transformers and torch.")
    except Exception as e:
        raise RuntimeError(f"Failed to load Llama model from {model_path}: {e}")

    snippet = (snippet_text or "").strip()
    if not snippet:
        return ""

    snippet = snippet[:max_input_chars]

    system_prompt = """You are a regulatory dossier analyst comparing two submission packages.

Produce a clear, professional plain-language summary of the given document excerpt."""

    user_prompt = f"""Read the extracted text below from a single document. Write ONE cohesive plain-language paragraph (3–6 sentences) that explains what this document appears to be, what main topics or data it covers, and how it would matter in a CTD-style dossier review. Be specific where the text allows; do not invent facts not supported by the excerpt.

Rules:
- Output only the paragraph — no title, no bullet list, no JSON.
- Do not start with phrases like "This document" every sentence; vary wording naturally.

Extracted text:
\"\"\"
{snippet}
\"\"\"

Provide the summary paragraph:"""

    try:
        # Prepare messages for Llama
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        
        # Format for Llama using chat template
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
                max_new_tokens=max_output_tokens,
                temperature=0.2,
                top_p=0.9,
                do_sample=False,
            )
        
        # Decode
        text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract generated text (remove prompt from output)
        if "[/INST]" in text:
            text = text.split("[/INST]")[-1].strip()
        
        return text.strip()
        
    except Exception as e:
        import logging
        logger = get_logger(__name__)
        logger.error(f"Llama inference failed: {e}")
        raise RuntimeError(f"Failed to generate summary: {e}")
