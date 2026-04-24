from __future__ import annotations  
import os
from src.utils.logger import get_logger
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"]  = "1"
os.environ.setdefault("TRANSFORMERS_NO_TORCHVISION", "1")

import logging
import re
from pathlib import Path
from typing import List, Tuple, Optional

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
)

try:
    from peft import PeftModel
    PEFT_AVAILABLE = True
except ImportError:
    PEFT_AVAILABLE = False
    logging.warning("PEFT not installed. Run: pip install peft")

from .labeled_patterns import compile_labeled_patterns
from .models import DetectedEntity

logger = get_logger(__name__)

#  Paths — relative to this file 
_HERE = Path(__file__).parent
BASE_MODEL:   str = str(_HERE / "dslimbert-base-NER" / "dslimbert-base-NER" / "bert-base-ner")
ADAPTER_PATH: str = str(_HERE / "ner_lora_adapter")

NER_THRESHOLD: float = 0.75

_COMPILED_LABEL_PATTERNS: List[Tuple[str, re.Pattern, float]] = (
    compile_labeled_patterns()
)

# NER often fires on table headers / field labels; substring replace in .docx then corrupts labels.
_NER_SPURIOUS: frozenset[str] = frozenset({
    "applicant", "sponsor", "contact", "regulatory", "legal", "representative",
    "identifier", "identifiers", "protocol", "investigator", "subject", "patient",
    "signature", "signatory", "manufacturer", "cro", "version", "document",
    "author", "reviewer", "name", "address", "phone", "email", "site", "nda",
    "ind", "eudract", "report", "study", "lot", "batch", "donor", "gender",
    "age", "death", "screening", "enrollment", "consent", "manager", "affairs",
    "principal", "qualified", "person", "committee", "ethics", "lab", "contract",
    "watermark", "confidential", "org", "ltd", "inc", "corp", "plc", "gmbh",
    "path", "file", "medical", "mental", "health",
    "applicable", "repeat", "title", "signed", "number",
    "record",
})

# NER label → canonical entity type mapping
_NER_LABEL_MAP: dict = {
    "PER":               "PERSON",
    "B-PER":             "PERSON",
    "I-PER":             "PERSON",
    "PERSON":            "PERSON",
    "ORG":               "ORGANISATION",
    "B-ORG":             "ORGANISATION",
    "I-ORG":             "ORGANISATION",
    "LOC":               "LOCATION",
    "B-LOC":             "LOCATION",
    "I-LOC":             "LOCATION",
    "MISC":              "MISC",
    "B-MISC":            "MISC",
    "I-MISC":            "MISC",
    "AADHAAR":           "AADHAAR",
    "DATE":              "DATE",
    "AGE":               "AGE",
    "MEDICAL_CONDITION": "MEDICAL_CONDITION",
    "DIAGNOSIS":         "DIAGNOSIS",
    "PHONE_NUMBER":      "PHONE",
    "PATIENT_ID":        "PATIENT_ID",
    # US spelling / extra BIO tags (common in fine-tuned NER)
    "ORGANIZATION":      "ORGANISATION",
    "B-ORGANIZATION":    "ORGANISATION",
    "I-ORGANIZATION":    "ORGANISATION",
    "E-ORG":             "ORGANISATION",
    "E-PER":             "PERSON",
    "E-LOC":             "LOCATION",
    "B-DISEASE":         "DIAGNOSIS",
    "I-DISEASE":         "DIAGNOSIS",
    "DISEASE":           "DIAGNOSIS",
    "B-CONDITION":       "MEDICAL_CONDITION",
    "I-CONDITION":       "MEDICAL_CONDITION",
    "CONDITION":         "MEDICAL_CONDITION",
    "B-TREATMENT":       "MEDICAL_CONDITION",
    "I-TREATMENT":       "MEDICAL_CONDITION",
    "DRUG":              "MEDICAL_CONDITION",
    "B-DRUG":            "MEDICAL_CONDITION",
}

_BROAD_REGEX_TYPES: frozenset[str] = frozenset({
    "VITAL_SIGNS",
    "LAB_RESULTS",
    "LAB_RESULTS_SUMMARY_TABLES",
    "MEDICATION_DOSAGE",
    "DIAGNOSIS_CONDITION",
    "ADVERSE_EVENT_NARRATIVE",
    "MENTAL_HEALTH_INFO",
    "SUBSTANCE_USE",
    "SURGERY_DETAILS",
    "PREGNANCY_STATUS",
    "GENETIC_INFORMATION",
})

_NOISE_SUBSTRINGS: tuple[str, ...] = (
    "management by laboratory methods",
    "as well as blood sugar",
    "consumption can cause raised uric acid",
    "history parameters",
    "compliance assessment checklist",
    "record datetime",
    "fit status",
    "test reading",
    "details [adverse event monitoring]",
    "[post study safety]",
    "collect volume (ml)",
)

_MED_DOSAGE_HINTS: tuple[str, ...] = (
    " mg", "mcg", " g", " ml", "iu", "unit", "mg/kg", "mcg/kg",
    "tablet", "capsule", "dose", "dosage", "route", "amphotericin",
)
_VITAL_HINTS: tuple[str, ...] = (
    "bp", "blood pressure", "heart rate", "pulse", "spo2",
    "temperature", "systolic", "diastolic",
)


def _is_valid_regex_value(entity_type: str, value: str, full_match: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False

    # Skip dot leaders / TOC-like artifacts.
    if re.search(r"\.{4,}", v):
        return False
    if re.fullmatch(r"[-–—.:;,\s\[\]\(\)/_]+", v):
        return False

    low = v.lower()
    # Common PDF schedule/table labels that should not be anonymised as PHI.
    if re.search(r"\[(study|check[- ]?in|check[- ]?out|pre[- ]?enrollment|post[- ]?dose)\]", low):
        return False

    if entity_type in _BROAD_REGEX_TYPES:
        # Broad "label -> line" captures must carry meaningful text.
        alnum_len = len(re.sub(r"[^A-Za-z0-9]+", "", v))
        if alnum_len < 4:
            return False
        # Reject mostly numeric counters like "10", "1", etc.
        if re.fullmatch(r"\d{1,3}", v):
            return False
        # Filter recurring non-PII/PHI instructional phrases seen in CRF PDFs.
        if any(n in low for n in _NOISE_SUBSTRINGS):
            return False
        # Single generic tokens (e.g. "Test", "Supine", "Sitting", "Indication")
        # are usually row labels, not values to anonymise.
        if len(v.split()) <= 2 and len(v) < 18 and entity_type in {
            "VITAL_SIGNS", "MEDICATION_DOSAGE", "SUBSTANCE_USE", "DIAGNOSIS_CONDITION"
        }:
            return False
        # Clamp very long prose-like rows from form instructions.
        if len(v) > 90 and entity_type in {
            "MEDICATION_DOSAGE", "VITAL_SIGNS", "DIAGNOSIS_CONDITION", "SUBSTANCE_USE"
        }:
            return False

    if entity_type == "MEDICATION_DOSAGE":
        has_unit = bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|mg/kg|mcg/kg)\b", low))
        has_hint = any(h in low for h in _MED_DOSAGE_HINTS)
        return has_unit or has_hint

    if entity_type == "VITAL_SIGNS":
        has_vital = any(h in low for h in _VITAL_HINTS)
        has_value = bool(re.search(r"\b\d{2,3}(?:/\d{2,3})?\b", v))
        return has_vital or has_value

    if entity_type == "DIAGNOSIS_CONDITION":
        # Require diagnosis/condition-like wording or known condition keywords.
        return bool(re.search(
            r"(diagnos|condition|diabet|hypertension|cancer|tb|tuberculosis|hiv|aids|covid|asthma|hepatitis)",
            low,
        ))

    if entity_type == "AGE":
        nums = re.findall(r"\d+", v)
        if not nums:
            return False
        age = int(nums[0])
        return 0 < age <= 120 and age >= 10

    if entity_type in {"SUBJECT_ID", "PATIENT_SUBJECT_ID", "PATIENT_ID", "MEDICAL_RECORD_NUMBER"}:
        lowv = v.lower()
        if lowv in {"yes", "no", "na", "n/a"}:
            return False
        # Expect stable identifier-like token, not plain text words.
        if not re.search(r"\d", v):
            return False

    return True


def _trim_span(text: str, start: int, end: int) -> Tuple[str, int, int]:
    """Return stripped value and adjusted [start, end) into original text."""
    raw = text[start:end]
    lead = len(raw) - len(raw.lstrip())
    trail = len(raw) - len(raw.rstrip())
    ns = start + lead
    ne = end - trail
    return text[ns:ne], ns, ne


def is_token_isolated(text: str, start: int, end: int) -> bool:
    """Ensure the match is a standalone term and not a substring of a larger word."""
    if start < 0 or end > len(text) or start >= end:
        return False
    if start > 0:
        c = text[start - 1]
        if c.isalnum() or c == "_":
            return False
    if end < len(text):
        c = text[end]
        if c.isalnum() or c == "_":
            return False
    return True


class EntityDetector:
    """Use local dslim BERT NER with regex-first detection and NER fallback while avoiding redaction of unlabeled dates."""

    def __init__(self):
        self.device = 0 if torch.cuda.is_available() else -1
        self.tokenizer = None
        self.model = None
        self._load_model()

    def _load_model(self):
        base_path    = str(Path(BASE_MODEL).resolve())
        adapter_path = str(Path(ADAPTER_PATH).resolve())

        logger.info(f"Loading tokenizer from: {base_path}")
        self.tokenizer = AutoTokenizer.from_pretrained(base_path)

        #  Load Label Map if exists (essential for PEFT classifier alignment) 
        label2id = None
        id2label = None
        label_map_file = os.path.join(adapter_path, "label_map.json")
        if os.path.isfile(label_map_file):
            import json
            try:
                with open(label_map_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    label2id = data.get("label2id")
                    # JSON keys are strings, need to convert back to int for id2label
                    if label2id:
                        id2label = {int(v): k for k, v in label2id.items()}
                logger.info(f"Loaded label map with {len(label2id)} classes.")
            except Exception as e:
                logger.warning(f"Failed to load label map from {label_map_file}: {e}")

        logger.info(f"Loading base model from: {base_path}")
        if label2id and id2label:
            base_model = AutoModelForTokenClassification.from_pretrained(
                base_path,
                num_labels=len(label2id),
                id2label=id2label,
                label2id=label2id,
                ignore_mismatched_sizes=True  # Allow reresizing the classifier head
            )
        else:
            base_model = AutoModelForTokenClassification.from_pretrained(base_path)

        adapter_loaded = False
        if PEFT_AVAILABLE and os.path.isdir(adapter_path):
            try:
                logger.info(f"Loading PEFT adapter from: {adapter_path}")
                base_model = PeftModel.from_pretrained(base_model, adapter_path)
                base_model = base_model.merge_and_unload()
                adapter_loaded = True
                logger.info("Adapter merged successfully.")
            except Exception as exc:
                logger.warning(f"Adapter load failed ({exc}). Using base model only.")
        else:
            logger.info("No adapter folder found — using base model weights only.")

        base_model.eval()
        if self.device >= 0:
            base_model.to("cuda")

        self.model = base_model
        logger.info(
            f"NER model ready | "
            f"adapter={'yes' if adapter_loaded else 'no'} | "
            f"device={'GPU' if self.device >= 0 else 'CPU'}"
        )

    def detect(self, text: str, use_ner: bool = True) -> List[DetectedEntity]:
        """Regex (label-first) then NER; merge overlapping spans."""
        regex_hits = self._regex_detect(text)
        ner_hits   = self._ner_detect(text) if use_ner else []
        merged     = self._fuse(regex_hits, ner_hits)
        merged = [
            e for e in merged
            if is_token_isolated(text, e.start, e.end)
        ]
        return sorted(merged, key=lambda e: e.start)

    def _regex_detect(self, text: str) -> List[DetectedEntity]:
        results: List[DetectedEntity] = []
        for entity_type, pattern, base_score in _COMPILED_LABEL_PATTERNS:
            for m in pattern.finditer(text):
                try:
                    val, s, e = _trim_span(text, m.start(1), m.end(1))
                except IndexError:
                    logger.warning(
                        "Pattern for %s missing capture group 1 — skipped.",
                        entity_type,
                    )
                    continue
                if not val:
                    continue
                full_match = m.group(0)
                if not _is_valid_regex_value(entity_type, val, full_match):
                    continue
                results.append(DetectedEntity(
                    text=val,
                    entity_type=entity_type,
                    start=s,
                    end=e,
                    score=base_score,
                    source="regex",
                ))
        return results

    def _ner_detect(self, text: str) -> List[DetectedEntity]:
        results: List[DetectedEntity] = []
        if not self.model or not self.tokenizer:
            return results
        # Large form-like documents (especially PDF text streams) are better
        # handled by regex + structured rules; running NER on full text can be
        if len(text) > 25000:
            logger.info("Skipping NER for large document (%s chars).", len(text))
            return results

        # Chunk long documents to avoid max_length truncation.
        max_len = int(getattr(self.tokenizer, "model_max_length", 512) or 512)
        stride = 64
        try:
            enc = self.tokenizer(
                text,
                return_offsets_mapping=True,
                return_overflowing_tokens=True,
                stride=stride,
                truncation=True,
                max_length=max_len,
                padding=True,
                return_tensors="pt",
            )
        except Exception as exc:
            logger.error(f"Tokenizer error: {exc}")
            return results

        input_ids = enc["input_ids"]
        attn = enc["attention_mask"]
        offsets = enc["offset_mapping"] 

        id2label = getattr(self.model.config, "id2label", {}) or {}

        with torch.no_grad():
            for ci in range(input_ids.shape[0]):
                ids = input_ids[ci : ci + 1]
                am = attn[ci : ci + 1]
                off = offsets[ci]
                if self.device >= 0:
                    ids = ids.to("cuda")
                    am = am.to("cuda")

                out = self.model(input_ids=ids, attention_mask=am)
                logits = out.logits[0]  # (seq_len, num_labels)
                probs = torch.softmax(logits, dim=-1)
                conf, pred_ids = torch.max(probs, dim=-1)

                # Convert to entities by grouping contiguous non-O labels.
                current_label: Optional[str] = None
                current_start: Optional[int] = None
                current_end: Optional[int] = None
                current_conf: float = 0.0

                def _flush():
                    nonlocal current_label, current_start, current_end, current_conf
                    if (current_label and current_start is not None and current_end is not None and 
                        current_end > current_start):
                        word = text[current_start:current_end].strip()
                        if word:
                            low = word.lower()
                            if len(low) >= 2 and low not in _NER_SPURIOUS:
                                results.append(
                                    DetectedEntity(
                                        text=word,
                                        entity_type=current_label,
                                        start=current_start,
                                        end=current_end,
                                        score=round(current_conf, 4),
                                        source="ner",
                                    )
                                )
                    current_label = None
                    current_start = None
                    current_end = None
                    current_conf = 0.0

                for ti in range(off.shape[0]):
                    s = int(off[ti][0].item())
                    e = int(off[ti][1].item())
                    if s == 0 and e == 0:
                        continue  # special tokens
                    label_raw = id2label.get(int(pred_ids[ti].item()), "O")
                    if label_raw == "O":
                        _flush()
                        continue

                    # normalize BIO-like labels
                    label_clean = label_raw
                    if "-" in label_clean:
                        label_clean = label_clean.split("-", 1)[1]
                    canonical = _NER_LABEL_MAP.get(label_clean, label_clean)

                    # No blind dates from NER — use labeled regex for PHI/study dates only.
                    if canonical == "DATE":
                        _flush()
                        continue

                    score = float(conf[ti].item())
                    if score < NER_THRESHOLD:
                        _flush()
                        continue

                    if current_label is None:
                        current_label = canonical
                        current_start = s
                        current_end = e
                        current_conf = score
                    else:
                        # extend only if same label and touching/overlapping
                        if canonical == current_label and s <= (current_end or s):
                            current_end = max(current_end or e, e)
                            current_conf = min(current_conf, score)
                        else:
                            _flush()
                            current_label = canonical
                            current_start = s
                            current_end = e
                            current_conf = score

                _flush()

        return results

    def _fuse(
        self,
        regex_hits: List[DetectedEntity],
        ner_hits: List[DetectedEntity],
    ) -> List[DetectedEntity]:
        """
        Merge regex + NER results.
        Overlapping spans → keep highest confidence score.
        Same span from both sources → mark as 'hybrid'.
        """
        all_hits = regex_hits + ner_hits
        if not all_hits:
            return []

        all_hits.sort(key=lambda e: (e.start, -e.score))

        fused: List[DetectedEntity] = []
        for candidate in all_hits:
            if overlapping := [
                e for e in fused
                if e.start < candidate.end and candidate.start < e.end
            ]:
                for existing in overlapping:
                    if existing.start == candidate.start and existing.end == candidate.end:
                        existing.source = "hybrid"
                        existing.score = max(existing.score, candidate.score)

                if all(e.score < candidate.score for e in overlapping):
                    fused = [e for e in fused if not (
                        e.start < candidate.end and candidate.start < e.end
                    )]
                    fused.append(candidate)
            else:
                fused.append(candidate)

        return fused
