import io
import json
import os
import fitz
from docx import Document
from huggingface_hub import AsyncInferenceClient
from dotenv import load_dotenv
from src.utils.logger import get_logger
logger = get_logger(__name__)

load_dotenv()

SPEC_CHECKS = [
    "Description", "Identification", "Assay", "Impurities"
]

def extract_text(filename: str, file_bytes: bytes) -> str:
    """
    Extracts text from .docx, .pdf, or other text-based files.
    """
    if filename.lower().endswith(".docx"):
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
    
    elif filename.lower().endswith(".pdf"):
        pdf = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in pdf:
            text += page.get_text()
        pdf.close()
        return text
    
    else:
        try:
            return file_bytes.decode("utf-8")
        except:
            return file_bytes.decode("utf-8", errors="ignore")

async def analyze_specification(doc_text: str) -> dict:
    """
    Uses Llama-3.1-8B-Instruct to analyze the drug specification document using universal checks.
    """
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is missing in the environment variables.")
    client = AsyncInferenceClient(model="meta-llama/Llama-3.1-8B-Instruct", token=token)
    
    system_prompt = """
You are a pharmaceutical regulatory specialist. Analyze the provided drug specification document. 
Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
"""

    user_prompt = f"""
Document content:
{doc_text[:8000]}

Check whether the following universal specification criteria are present in the document:
{json.dumps(SPEC_CHECKS, indent=2)}

Return this exact JSON structure:
{{
  "drug name": "<string>",
  "checks": "passed" or "not passed",
  "missing": ["<list of missing check names from the universal list>"]
}}

Logic for "checks":
- "passed" if ALL universal criteria are present.
- "not passed" if any criteria are missing.
"""

    def get_completion(prompt_msg):
        return client.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt_msg}
            ],
            max_tokens=220,
            temperature=0
        )

    try:
        response = await get_completion(user_prompt)
        raw = response.choices[0].message.content.strip()
        
        # Basic cleaning of markdown if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
            
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Retry once
            retry_prompt = f"Previous response was not valid JSON. Please return ONLY the JSON object for this content:\n\n{doc_text[:4000]}"
            response = await get_completion(retry_prompt)
            raw = response.choices[0].message.content.strip()
            
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            
            return json.loads(raw)
            
    except Exception as e:
        raise e
