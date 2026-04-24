from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from utils.logger import get_logger

logger = get_logger(__name__)

SYSTEM_PROMPT = """
You are a senior pharmaceutical regulatory reviewer. 
You will receive the full text of multiple CTD dossier modules. 
Your job is to: 
   1. Find the value of a specific field across all modules 
   2. Check whether the value is consistent across modules 
 
Rules you must follow: 
- Read the full text carefully. The value may appear anywhere in the document. 
- Never return "NOT FOUND" — always search the entire text thoroughly. 
   If after thorough reading the information is genuinely absent from all modules, 
   return "Not available in dossier" as the value. 
- If the field is found in some modules but not others, that is acceptable — 
   use the found value and mark as Consistent. 
- Only mark Inconsistent when the same field has clearly different values 
   across two or more modules (e.g. different strength, different manufacturer name). 
- Synonyms and abbreviations for the same thing are Consistent, not Inconsistent. 
   Examples: 
     "Injection" and "Solution for Injection" → same → Consistent 
     "Amphotericin B" and "AmBisome" → same drug → Consistent 
     "50 mg/vial" and "50mg" → same → Consistent 
     "50 mg" and "100 mg" → different → Inconsistent 
- Return ONLY a valid JSON object. No markdown. No explanation outside the JSON. 
"""

MODEL_NAME = "gpt-4o-mini"
MAX_TOKENS = 300


def _strip_json_fences(raw: str) -> str:
    """Remove optional ```json ... ``` wrapping."""
    t = raw.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    return m[1].strip() if m else t


def _llama_infer(field_name: str, module_texts: dict[str, str]) -> dict:
    """Synchronous Llama inference (runs in thread pool when called via asyncio.to_thread)."""
    logger.info(f"Starting Llama inference for field: {field_name}")
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch
        import os
        from dotenv import load_dotenv
        
        # Load environment
        load_dotenv()
        
        # Get model path from env or use default
        model_path = os.getenv("LOCAL_LLM_MODEL_PATH") or "meta-llama/Llama-3.1-8B-Instruct"
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map="auto" if device == "cuda" else None,
        )
        if device == "cpu":
            model = model.to(device)
            
    except ImportError as e:
        logger.error(f"Failed to load Llama model: {e}")
        return {
            field_name: "Error: Transformers package not installed",
            "consistency": "Consistent"
        }
    except Exception as e:
        logger.exception(f"Llama model loading failed for field {field_name}")
        return {
            field_name: f"Error: {str(e)[:100]}",
            "consistency": "Consistent"
        }

    formatted_module_texts = "\n\n".join(
        f"=== {mod} ===\n{text[:4000]}" 
        for mod, text in module_texts.items() 
        if text.strip()
    )

    system_prompt = SYSTEM_PROMPT
    
    user_prompt = f"""
Field to check: {field_name} 
 
Module texts: 
{formatted_module_texts} 
 
Return exactly this JSON structure: 
{{ 
  "{field_name}": "<the value found — be specific, never say NOT FOUND>", 
  "consistency": "Consistent" or "Inconsistent" 
}} 
 
If the field has different values in different modules, set consistency to 
"Inconsistent" and set the value to show both values found, like: 
"M2: 50mg | M3: 100mg" 
 
If the field has the same value (or compatible values) across modules, 
set consistency to "Consistent" and set the value to the common value found.
"""

    try:
        # Prepare messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        
        # Format for Llama
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
                temperature=0,
                top_p=0.9,
                do_sample=False,
            )
        
        # Decode
        content = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        
        try:
            return json.loads(_strip_json_fences(content))
        except Exception as e:
            logger.warning("LLM JSON parse failed for %s: %s", field_name, e)
            return {
                field_name: "Could not parse response",
                "consistency": "Consistent"
            }

    except Exception as e:
        logger.exception("Llama call failed for field %s", field_name)
        return {
            field_name: f"Error: {e!s}",
            "consistency": "Consistent"
        }


async def check_field(
    field_name: str,
    module_texts: dict[str, str]
) -> dict:
    """
    Single LLM call for one field using local Llama model.
    
    Sends full module texts.
    Returns: { "field_name": value, "consistency": "Consistent"/"Inconsistent" }
    """
    logger.info(f"Checking field: {field_name} with {len(module_texts)} modules")
    # Run synchronous Llama inference in a thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _llama_infer, field_name, module_texts)


async def check_all_fields(
    field_names: list[str],
    module_texts: dict[str, str]
) -> list[dict]:
    """
    Runs all 10 check_field calls concurrently using asyncio.gather.
    Returns list of 10 result dicts.
    """
    logger.info(f"Checking all {len(field_names)} fields concurrently")
    return list(await asyncio.gather(*(check_field(name, module_texts) for name in field_names)))
