import asyncio
import os
from typing import List, Dict
from .extraction_service import extraction_service
from .chunking_service import chunking_service
from .llm_service import llm_service

# Global registry to track duplicate cases in memory runtime
# Global registry to track duplicate cases in memory runtime
classified_cases_registry = []

class ClassificationPipeline:
    
    async def run(self, file_paths: List[str]) -> List[Dict]:
        """
        Processes each file as an independently classified SAE Case.
        """
        all_classifications = []
        
        tasks = [self._process_single_file(path) for path in file_paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, Exception):
                raise result
            elif isinstance(result, dict) and "error" in result:
                raise ValueError(result["error"])
            else:
                all_classifications.append(result)
                
        return all_classifications

    async def _process_single_file(self, file_path: str) -> Dict:
        """Isolated processing for a single raw file."""
        file_name = os.path.basename(file_path)
        
        # Step 1: Text Extraction
        pages = extraction_service.process_file(file_path)
        if not pages:
            return {"error": f"No text could be extracted from {file_path}."}

        # Step 1.5: CTD Module Detection (LLM-based)
        # Use first 2 pages (or first 3000 chars) for module detection
        sample_text = ""
        for page in pages[:2]:
            sample_text += page.get('raw_text', '')[:1500]
            if len(sample_text) >= 3000:
                break

        module_detection = await llm_service.detect_ctd_module(sample_text, file_name)
        detected_module = module_detection.get("detected_module", "Unknown")
        is_sae_applicable = module_detection.get("is_sae_applicable", False)

        # If NOT Module 5, return early with module info
        if detected_module != "Module 5" and not is_sae_applicable:
            return {
                "file_name": file_name,
                "detected_module": detected_module,
                "module_confidence": module_detection.get("confidence", "low"),
                "module_reasoning": module_detection.get("reasoning", ""),
                "classification": {
                    "seriousness": {"value": "N/A", "confidence": "high", "source": []},
                    "priority": {"value": "N/A", "confidence": "high", "source": []},
                    "classification_source": "CTD Module Detection",
                    "causality": {"value": "N/A", "confidence": "high", "source": []},
                    "expectedness": {"value": "N/A", "confidence": "high", "source": []}
                },
                "duplicate_detection": {
                    "is_duplicate": False,
                    "duplicate_of": "",
                    "similarity_score": 0.0,
                    "reason": f"File from {detected_module} - SAE classification not applicable"
                },
                "regulatory": {
                    "alert_flag": "N/A",
                    "regulatory_action": f"Route to {detected_module} reviewer"
                },
                "message": f"This document was detected as {detected_module}. SAE classification only applies to Module 5 (Clinical Study Reports)."
            }

        # Step 2: Chunking Strategy (Only for Module 5 documents)
        chunks = chunking_service.create_chunks(pages)
        
        # Step 3: Map Phase (Chunk-level signal extraction)
        map_tasks = [llm_service.classification_map_chunk(chunk) for chunk in chunks]
        partial_summaries = await asyncio.gather(*map_tasks)
        
        for i, chunk in enumerate(chunks):
            if isinstance(partial_summaries[i], dict):
                partial_summaries[i]["_chunk_id"] = chunk["chunk_id"]

        # Step 4: Hybrid Classification (Rule-Based Primary)
        override_classification = self._apply_hybrid_rules(partial_summaries)

        # Step 5: Reduce Phase (File-Level Aggregation + LLM Secondary Refinement)
        final_classification = await llm_service.classification_reduce(partial_summaries, override_classification)
        
        # Step 6: Duplicate Detection
        dup_info = self._check_duplicate(file_name, final_classification)
        final_classification["duplicate_detection"] = dup_info
        final_classification["file_name"] = file_name

        # Add module detection metadata
        final_classification["detected_module"] = detected_module
        final_classification["module_confidence"] = module_detection.get("confidence", "low")
        final_classification["module_reasoning"] = module_detection.get("reasoning", "")

        # Register to registry
        classified_cases_registry.append({
            "file_name": file_name,
            "signature": str(final_classification.get("classification", {}))
        })
        
        return final_classification

    def _apply_hybrid_rules(self, partial_summaries: list[dict]) -> dict:
        """
        Primary Rule-Based Logic for Severity & Priority.
        Death/Disability -> High Priority. Hospitalisation -> Medium Priority. Else -> Low.
        """
        combined_text = str(partial_summaries).lower()
        
        seriousness = "Others"
        priority = "Low"
        source = "LLM-Refined"
        
        # Simple rule-based scan
        if "death" in combined_text or "fatal" in combined_text:
            seriousness = "Death"
            priority = "High"
            source = "Rule-Based"
        elif "disability" in combined_text or "disabled" in combined_text:
            seriousness = "Disability"
            priority = "High"
            source = "Rule-Based"
        elif "hospitalisation" in combined_text or "hospitalization" in combined_text or "admitted" in combined_text:
            seriousness = "Hospitalisation"
            priority = "Medium"
            source = "Rule-Based"
            
        if source == "Rule-Based":
            return {
                "seriousness": seriousness,
                "priority": priority,
                "classification_source": source
            }
        return None # Let LLM infer if rules fail
        
    def _check_duplicate(self, current_file: str, final_classification: dict) -> dict:
        """
        Detects duplicates based on simple string signature caching.
        """
        current_sig = str(final_classification.get("classification", {})).lower()
        
        for case in classified_cases_registry:
            # Same file name is an obvious duplicate (if reuploaded)
            if case["file_name"] == current_file:
                return {
                    "is_duplicate": True,
                    "duplicate_of": case["file_name"],
                    "similarity_score": 1.0,
                    "reason": "Exact file name match in registry."
                }
            # Or if the signal text is highly similar (naive approximation)
            # This can be upgraded to Cosine Similarity later.
            if current_sig != "{}" and current_sig == case["signature"].lower():
                return {
                    "is_duplicate": True,
                    "duplicate_of": case["file_name"],
                    "similarity_score": 0.95,
                    "reason": "Semantic signature heavily matches an existing case."
                }
        
        return {
            "is_duplicate": False,
            "duplicate_of": "",
            "similarity_score": 0.0,
            "reason": "No matching cases found."
        }

classification_pipeline = ClassificationPipeline()
