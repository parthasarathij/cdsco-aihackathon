import zipfile
import io
import re
import fitz  # PyMuPDF
from docx import Document
from pathlib import Path
from src.utils.logger import get_logger
logger = get_logger(__name__)

# Anchors used for Field 2 (Product Name) in Dossier Consistency Checker
PRODUCT_NAME_ANCHORS = (
    r"product\s+name\s*[:]",
    r"name\s+of\s+(the\s+)?product\s*[:]",
    r"proposed\s+name\s*[:]",
    r"invented\s+name\s*[:]",
    r"proprietary\s*[,]?\s*commercial\s*or\s*trade\s*name\s*[:]",
)

def extract_product_name_regex(text: str) -> str | None:
    """
    Uses the same logic as Dossier Consistency Checker to find product/drug name.
    """
    # 1. Search for anchors
    matches = []
    for pat in PRODUCT_NAME_ANCHORS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE | re.MULTILINE):
            matches.append(m)
    
    # 2. If no anchors, try fallback to common drug names
    if not matches:
        common_drugs = r"\b(Paracetamol|Ibuprofen|Aspirin|Metformin|Omeprazole|Amlodipine|Atorvastatin|Ciprofloxacin|Levofloxacin|Metronidazole|Losartan|Ranitidine|Ceftriaxone|Azithromycin|Prednisone|Dexamethasone|Pantoprazole|Cephalexin|Amoxicillin|Amphotericin)\b"
        match = re.search(common_drugs, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
        return None

    # 3. Sort matches by position
    matches.sort(key=lambda x: x.start())
    
    # 4. Extract first substantial line after an anchor
    for m in matches[:25]:
        start = m.start()
        # Look ahead from the anchor
        snippet = text[start:start+1000]
        lines = [ln.strip() for ln in snippet.splitlines() if ln.strip()]
        
        for ln in lines:
            # Clean the line by removing the anchor itself
            clean_ln = ln
            for pat in PRODUCT_NAME_ANCHORS:
                clean_ln = re.sub(pat, "", clean_ln, flags=re.I).strip()
            
            # Skip empty, very short, or noise lines
            if not clean_ln or len(clean_ln) < 3:
                continue
            if re.match(r"^(section|table|figure)\b", clean_ln, re.I):
                continue
            if clean_ln.lower() in ["ovations", "table", "content", "page", "module", "not applicable", "n/a"]:
                continue
                
            # If we found a valid name, return it
            name = clean_ln[:500]
            name = re.sub(r'\s+', ' ', name)
            return name
            
    return None

def extract_text_from_zip(zip_bytes: bytes) -> tuple[str, int, str | None]:
    """
    Extracts text from PDF and DOCX files inside a ZIP archive in memory.
    Stops searching if product name regex match is found early.
    Returns (combined_text, file_count, regex_drug_name).
    """
    combined_text = []
    file_count = 0
    max_chars = 40000
    found_drug_name = None

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        for file_info in z.infolist():
            # Skip directories and __MACOSX files
            if file_info.is_dir() or "__MACOSX" in file_info.filename:
                continue

            file_ext = Path(file_info.filename).suffix.lower()
            file_text = ""
            
            try:
                if file_ext == ".pdf":
                    print(f"Processing PDF: {file_info.filename}")
                    pdf_data = z.read(file_info.filename)
                    if not pdf_data:
                        print(f"Empty PDF data for {file_info.filename}")
                        continue
                    
                    try:
                        doc = fitz.open(stream=pdf_data, filetype="pdf")
                        # Extract text from first 15 pages
                        num_pages = min(15, len(doc))
                        pages_text = []
                        for page_num in range(num_pages):
                            page = doc.load_page(page_num)
                            pages_text.append(page.get_text())
                        file_text = "\n".join(pages_text)
                        doc.close()
                        file_count += 1
                    except Exception as pdf_err:
                        print(f"PyMuPDF failed on {file_info.filename}: {str(pdf_err)}")
                        continue

                elif file_ext == ".docx":
                    print(f"Processing DOCX: {file_info.filename}")
                    docx_data = z.read(file_info.filename)
                    if not docx_data:
                        print(f"Empty DOCX data for {file_info.filename}")
                        continue
                        
                    try:
                        doc = Document(io.BytesIO(docx_data))
                        paras = [para.text for para in doc.paragraphs]
                        file_text = "\n".join(paras)
                        file_count += 1
                    except Exception as docx_err:
                        print(f"python-docx failed on {file_info.filename}: {str(docx_err)}")
                        continue

                if file_text:
                    combined_text.append(file_text)
                    # Check for regex match in THIS file's text
                    found_drug_name = extract_product_name_regex(file_text)
                    if found_drug_name:
                        print(f"FOUND product name via regex: {found_drug_name} in {file_info.filename}. Stopping search.")
                        break

            except Exception as e:
                print(f"Fatal error extracting {file_info.filename}: {str(e)}")
                continue

    full_text = "\n".join(combined_text)
    return full_text[:max_chars], file_count, found_drug_name
