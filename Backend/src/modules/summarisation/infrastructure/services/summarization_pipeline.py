import asyncio
from typing import List, Dict
from .extraction_service import extraction_service
from .chunking_service import chunking_service
from .llm_service import llm_service
from src.utils.logger import get_logger
logger = get_logger(__name__)

class SummarizationPipeline:
    
    async def run(self, file_paths: List[str], task_type: str) -> Dict:
        # Step 1: Text Extraction
        all_pages = []
        for path in file_paths:
            pages = extraction_service.process_file(path)
            all_pages.extend(pages)
            
        if not all_pages:
            raise ValueError("No text could be extracted from provided files.")

        # Step 2: Chunking Strategy
        chunks = chunking_service.create_chunks(all_pages)
        
        # Step 3: Map Phase (Chunk Summarization)
        map_tasks = [llm_service.map_chunk(chunk, task_type) for chunk in chunks]
        partial_summaries = await asyncio.gather(*map_tasks)

        # Inject original chunk mapping metadata to partial summaries to ensure XAI trace
        for i, chunk in enumerate(chunks):
            partial_summaries[i]["_metadata_mapping"] = chunk["mapping"]
            partial_summaries[i]["_chunk_id"] = chunk["chunk_id"]

        # Step 4: Reduce Phase (Final Summary)
        final_summary = await llm_service.reduce_summaries(partial_summaries, task_type)
        
        # Step 5: Overall Summary Phase
        overall_summary = await llm_service.generate_overall_summary(final_summary)
        if "error" not in overall_summary:
            final_summary["overall_summary"] = overall_summary
        else:
            final_summary["overall_summary"] = {"value": "Error generating overall summary.", "confidence": "low", "source": []}

        return final_summary

summarization_pipeline = SummarizationPipeline()
