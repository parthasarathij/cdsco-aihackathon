import os
import json
from huggingface_hub import AsyncInferenceClient
from dotenv import load_dotenv
from src.utils.logger import get_logger
logger = get_logger(__name__)

# Load .env file
load_dotenv()

def get_llm_client():
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is missing in the environment variables.")
    return AsyncInferenceClient(model="meta-llama/Llama-3.1-8B-Instruct", token=token)



SYSTEM_PROMPT = """
You are a pharmaceutical regulatory expert. Analyze the dossier text and extract:

1. drug_name — The INN/generic name of the active ingredient only. No brand names.
2. strength — The dose strength with units (e.g. 500mg, 250mg/5ml, 0.3% w/v). Return the primary strength if multiple exist.
3. dosage_form — Standardize to one of: Tablet, Capsule, Injection, Suspension, Solution, Cream, Ointment, Drops, Powder, Syrup, Patch, Inhaler, Suppository, Gel, Spray

Rules:
- Respond ONLY with a JSON object. No explanation, no markdown.
- If a value is not found, return an empty string for that field.
- Never guess or hallucinate values.

Output format:
{
  "drug_name": "",
  "strength": "",
  "dosage_form": ""
}
"""

async def analyze_drug_info(text: str) -> dict:
    client = get_llm_client()

    try:
        response = await client.chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text}
            ],
            max_tokens=220,
            temperature=0
        )

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        raise e

DOSSIER_REVIEW_PROMPT = """
You are a pharmaceutical regulatory expert reviewing a CDSCO drug dossier.

CONTEXT:
- Product name found in dossier document: "{document_drug_name}"
- Product name from CDSCO approved drugs database: "{excel_drug_name}"
- Strength (if found): "{strength}"

TASK:
Compare the drug name from the dossier with the CDSCO approved drugs database and determine the correct submission type.

RULES:
1. If the drug from the dossier MATCHES (same active ingredient) a drug already in the CDSCO database, the submission should be a "Generic Drug Application" - NOT an NDA.
2. If the drug from the dossier is NOT FOUND in the CDSCO database, it may qualify for a "New Drug Application (NDA)".
3. Consider generic/INN name matching - brand names may differ but active ingredients matter.
4. If unsure, lean towards suggesting the safer option.

Respond ONLY with a JSON object. No explanation, no markdown.

Output format:
{{
  "submission_type": "Generic Drug Application" or "New Drug Application (NDA)",
  "reasoning": "Brief explanation of why this submission type is recommended",
  "match_confirmed": true or false
}}
"""

async def analyze_dossier_eligibility(document_drug_name: str, excel_drug_name: str, strength: str, text: str) -> dict:
    """
    Uses Llama-3.1-8B-Instruct to determine if a drug should be submitted as NDA or Generic
    based on comparison between document name and CDSCO database name.
    """
    client = get_llm_client()

    try:
        prompt = DOSSIER_REVIEW_PROMPT.format(
            document_drug_name=document_drug_name or "Not found in document",
            excel_drug_name=excel_drug_name or "Not found in database",
            strength=strength or "Not specified"
        )

        response = await client.chat_completion(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Dossier text excerpt:\n{text[:8000]}"}
            ],
            max_tokens=220,
            temperature=0
        )

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        raise e
