import uuid
from typing import List, Dict
from src.utils.logger import get_logger
logger = get_logger(__name__)

class ChunkingService:
    def __init__(self, chunk_size: int = 20):
        self.chunk_size = chunk_size

    def create_chunks(self, pages: List[Dict]) -> List[Dict]:
        """
        Takes a list of page dicts (with file_name, page_number, raw_text) and groups into chunks.
        Chunk size = 20 pages. Overlap = Include last page of previous chunk.
        """
        chunks = []
        if not pages:
            return chunks

        total_pages = len(pages)
        start_idx = 0
        
        while start_idx < total_pages:
            end_idx = min(start_idx + self.chunk_size, total_pages)
            chunk_pages = pages[start_idx:end_idx]
            
            chunk_id = f"chunk_{uuid.uuid4().hex[:8]}"
            
            # Maintain mapping: chunk_id -> file_name -> page_numbers
            metadata_mapping = {}
            text_content = ""
            
            for p in chunk_pages:
                fname = p['file_name']
                pnum = p['page_number']
                if fname not in metadata_mapping:
                    metadata_mapping[fname] = []
                metadata_mapping[fname].append(pnum)
                
                text_content += f"\n--- [FILE: {fname} | PAGE: {pnum}] ---\n"
                text_content += p.get('raw_text', '')
            
            chunks.append({
                "chunk_id": chunk_id,
                "mapping": metadata_mapping,
                "text": text_content,
                "pages": chunk_pages
            })
            
            if end_idx >= total_pages:
                break
                
            start_idx = end_idx - 1 

        return chunks

chunking_service = ChunkingService(chunk_size=20)
