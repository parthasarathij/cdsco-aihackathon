import asyncio
from typing import List, Dict
from .extraction_service import extraction_service
from .chunking_service import chunking_service
from .llm_service import llm_service
from src.utils.logger import get_logger
logger = get_logger(__name__)

class SAESummarizationPipeline:
    
    async def run(self, file_paths: List[str]) -> List[Dict]:
        """
        Process SAE files with STRICT DATA ISOLATION RULE: One file = One case.
        """
        all_cases = []
        
        tasks = [self._process_single_file(path) for path in file_paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, Exception):
                raise result
            elif isinstance(result, dict) and "error" in result:
                raise ValueError(result["error"])
            else:
                all_cases.append(result)
                
        return all_cases

    async def _process_single_file(self, file_path: str) -> Dict:
        """Isolated processing for a single SAE file."""
        
        # Step 1: Text Extraction (Strictly this file)
        pages = extraction_service.process_file(file_path)
            
        if not pages:
            return {"error": f"No text could be extracted from {file_path}."}

        # Step 2: Chunking Strategy (Strictly pages from this file)
        chunks = chunking_service.create_chunks(pages)
        
        # Step 3: Map Phase (Chunk Summarization)
        map_tasks = [llm_service.sae_map_chunk(chunk) for chunk in chunks]
        partial_summaries = await asyncio.gather(*map_tasks)

        # Inject original chunk mapping metadata to partial summaries to ensure XAI trace
        for i, chunk in enumerate(chunks):
            partial_summaries[i]["_metadata_mapping"] = chunk["mapping"]
            partial_summaries[i]["_chunk_id"] = chunk["chunk_id"]

        # Step 4: Reduce Phase (Final Summary for this specific file only)
        final_summary = await llm_service.sae_reduce_summaries(partial_summaries)
        
        # Step 5: Overall Summary Phase
        if "case" in final_summary:
            overall_summary_payload = await llm_service.generate_sae_overall_summary(final_summary["case"])
            if "error" not in overall_summary_payload:
                final_summary["case"]["overall_summary"] = overall_summary_payload
            else:
                final_summary["case"]["overall_summary"] = {
                    "value": "Error generating overall summary.",
                    "confidence": "low",
                    "source": []
                }
        
        return final_summary

sae_pipeline = SAESummarizationPipeline()
