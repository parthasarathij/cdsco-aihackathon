import os
import io
import logging
from PyPDF2 import PdfReader
import docx
from .storage_service import storage_service
from src.utils.logger import get_logger
logger = get_logger(__name__)

class ExtractionService:
    
    def process_file(self, file_path: str) -> list[dict]:
        """Routes the file to appropriate extraction module based on extension."""
        ext = file_path.lower().split('.')[-1]
        file_name = os.path.basename(file_path)
        
        pages = []
        if ext == 'pdf':
            pages = self.extract_pdf(file_path, file_name)
        elif ext in ['doc', 'docx']:
            pages = self.extract_docx(file_path, file_name)
        elif ext == 'mp3':
            pages = self.extract_mp3(file_path, file_name)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
            
        return pages

    def extract_pdf(self, file_path: str, file_name: str) -> list[dict]:
        pages = []
        logging.getLogger("PyPDF2").setLevel(logging.ERROR)
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                page_data = {"file_name": file_name, "page_number": i + 1, "raw_text": text}
                storage_service.save_extracted_page(**page_data)
                pages.append(page_data)
        return pages

    def extract_docx(self, file_path: str, file_name: str) -> list[dict]:
        pages = []
        with open(file_path, "rb") as f:
            doc = docx.Document(f)
        current_page_text = ""
        current_page_num = 1
        
        for para in doc.paragraphs:
            if 'w:br' in para._element.xml and 'type="page"' in para._element.xml:
                page_data = {"file_name": file_name, "page_number": current_page_num, "raw_text": current_page_text.strip()}
                storage_service.save_extracted_page(**page_data)
                pages.append(page_data)
                
                current_page_text = para.text + "\n"
                current_page_num += 1
            else:
                current_page_text += para.text + "\n"

        if current_page_text.strip():
            page_data = {"file_name": file_name, "page_number": current_page_num, "raw_text": current_page_text.strip()}
            storage_service.save_extracted_page(**page_data)
            pages.append(page_data)
            
        return pages

    def extract_mp3(self, file_path: str, file_name: str) -> list[dict]:
        from openai import OpenAI
        from ...core.config import settings
        pages = []
        
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        try:
            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                  model="whisper-1", 
                  file=audio_file
                )
            full_text = transcription.text
        except Exception as e:
            raise RuntimeError(f"Audio transcription failed: {e}")
            
        words = full_text.split()
        words_per_page = 400
        
        for i in range(0, len(words), words_per_page):
            page_text = " ".join(words[i:i + words_per_page])
            page_number = (i // words_per_page) + 1
            
            page_data = {"file_name": file_name, "page_number": page_number, "raw_text": page_text}
            storage_service.save_extracted_page(**page_data)
            pages.append(page_data)
            
        return pages

extraction_service = ExtractionService()
