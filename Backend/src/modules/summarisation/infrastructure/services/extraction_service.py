import os
from pathlib import Path
from typing import List, Dict
import fitz  # PyMuPDF
from docx import Document
from src.utils.logger import get_logger
logger = get_logger(__name__)

class ExtractionService:
    def process_file(self, file_path: str) -> List[Dict]:
        """
        Extract text from a single file (PDF or DOCX) and return list of page dicts.
        Each dict contains: file_name, page_number, raw_text
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        file_ext = file_path.suffix.lower()
        pages = []
        
        if file_ext == ".pdf":
            pages = self._extract_pdf(file_path)
        elif file_ext == ".docx":
            pages = self._extract_docx(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}. Only PDF and DOCX are supported.")
        
        return pages
    
    def _extract_pdf(self, file_path: Path) -> List[Dict]:
        """Extract text from PDF file."""
        pages = []
        try:
            doc = fitz.open(str(file_path))
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():  # Only include pages with text
                    pages.append({
                        "file_name": file_path.name,
                        "page_number": page_num + 1,  # 1-based
                        "raw_text": text
                    })
            doc.close()
        except Exception as e:
            raise Exception(f"Error extracting PDF {file_path}: {str(e)}")
        
        return pages
    
    def _extract_docx(self, file_path: Path) -> List[Dict]:
        """Extract text from DOCX file."""
        pages = []
        try:
            doc = Document(str(file_path))
            # DOCX doesn't have pages, so we'll treat paragraphs as "pages"
            text_content = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
            
            # Split into chunks of approximately page-sized content
            # Rough estimate: ~3000 characters per page
            chunk_size = 3000
            chunks = [text_content[i:i+chunk_size] for i in range(0, len(text_content), chunk_size)]
            
            for i, chunk in enumerate(chunks):
                if chunk.strip():
                    pages.append({
                        "file_name": file_path.name,
                        "page_number": i + 1,  # 1-based
                        "raw_text": chunk
                    })
        except Exception as e:
            raise Exception(f"Error extracting DOCX {file_path}: {str(e)}")
        
        return pages

extraction_service = ExtractionService()