from __future__ import annotations
from src.utils.logger import get_logger

import hashlib
import hmac
import re
import secrets
import logging
from typing import Dict, List, Optional, Tuple

from .labeled_patterns import PHI_DATE_ENTITY_TYPES
from .models import (
    DetectedEntity,
    MappingEntry,
    MappingTableResponse,
    AnonymisationMode,
)

logger = get_logger(__name__)

#  Generalisation rules

def _generalise_date(_: str) -> str:
    return "[DATE_REDACTED]"

def _generalise_age(text: str) -> str:
    if nums := re.findall(r"\d+", text):
        age = int(nums[0])
        decade_start = (age // 10) * 10
        return f"{decade_start}-{decade_start + 9}"
    return "[AGE_RANGE]"

def _generalise_phone(_: str) -> str:
    return "XXXX-XXXX-XX"

def _generalise_email(text: str) -> str:
    parts = text.split("@")
    domain = parts[1] if len(parts) == 2 else "redacted.com"
    return f"****@{domain}"

def _generalise_aadhaar(_: str) -> str:
    return "XXXX XXXX XXXX"

def _generalise_pan(_: str) -> str:
    return "XXXXX9999X"

def _generalise_person(_: str) -> str:
    return "<PATIENT_ID>"

def _generalise_location(_: str) -> str:
    return "<LOCATION>"

def _generalise_diagnosis(text: str) -> str:
    _CONDITION_MAP = {
        r"type[\s-]?1\s+diabet": "autoimmune endocrine disorder",
        r"type[\s-]?2\s+diabet": "common endocrine disorder",
        r"hypertension":          "cardiovascular condition",
        r"cancer":                "oncological condition",
        r"tuberculosis|tb":       "infectious respiratory condition",
        r"hiv|aids":              "immunological condition",
        r"covid|sars":            "viral respiratory condition",
    }
    low = text.lower()
    return next((label for pat, label in _CONDITION_MAP.items() if re.search(pat, low)), "medical condition")

def _generalise_ip(_: str) -> str:
    return "XXX.XXX.XXX.XXX"

def _generalise_passport(_: str) -> str:
    return "XXXXXXXXX"

def _generalise_bank(_: str) -> str:
    return "XXXXXXXXXXXXXXXX"

def _generalise_patient_id(_: str) -> str:
    return "<PATIENT_ID>"

def _redact(text: str) -> str:
    return "[REDACTED]"


def _entity_redacted(entity_type: str) -> str:
    safe = re.sub(r"[^A-Z0-9]+", "_", (entity_type or "ENTITY").upper()).strip("_") or "ENTITY"
    return f"[{safe}_REDACTED]"


_GENERALISE_FN: Dict[str, callable] = {
    "PERSON":            _generalise_person,
    "AADHAAR":           _generalise_aadhaar,
    "PAN":               _generalise_pan,
    "PHONE":             _generalise_phone,
    "EMAIL":             _generalise_email,
    "DATE":              _generalise_date,
    "AGE":               _generalise_age,
    "IP_ADDRESS":        _generalise_ip,
    "LOCATION":          _generalise_location,
    "DIAGNOSIS":         _generalise_diagnosis,
    "DIAGNOSIS_CONDITION": _generalise_diagnosis,
    "MEDICAL_CONDITION": _generalise_diagnosis,
    "PASSPORT":          _generalise_passport,
    "BANK_ACCOUNT":      _generalise_bank,
    "PATIENT_ID":        _generalise_patient_id,
    "ORGANISATION":      _redact,
    "MISC":              _redact,
}


def _generaliser_for_entity_type(entity_type: str):
    if entity_type in PHI_DATE_ENTITY_TYPES:
        return _generalise_date
    fn = _GENERALISE_FN.get(entity_type)
    if fn is _redact:
        return lambda _text: _entity_redacted(entity_type)
    return fn if fn is not None else lambda _text: _entity_redacted(entity_type)


_TOKEN_PREFIX: Dict[str, str] = {
    "PERSON":            "PER",
    "AADHAAR":           "AAD",
    "PAN":               "PAN",
    "PHONE":             "PHN",
    "EMAIL":             "EML",
    "DATE":              "DTE",
    "AGE":               "AGE",
    "IP_ADDRESS":        "IPA",
    "LOCATION":          "LOC",
    "DIAGNOSIS":         "DXN",
    "MEDICAL_CONDITION": "MCN",
    "PASSPORT":          "PSP",
    "BANK_ACCOUNT":      "BNK",
    "PATIENT_ID":        "PID",
    "ORGANISATION":      "ORG",
    "MISC":              "MSC",
}


class DocumentAnonymiser:

    def __init__(self):
        self._vault:   Dict[str, str] = {}   # original → token
        self._reverse: Dict[str, str] = {}   # token → original

    #  Public API 

    def anonymise(
        self,
        text:     str,
        entities: List[DetectedEntity],
        mode:     str,
        salt:     Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str], Optional[MappingTableResponse]]:
        sorted_ents = sorted(entities, key=lambda e: e.start, reverse=True)

        pseudo_text:    Optional[str]                  = None
        full_anon_text: Optional[str]                  = None
        mapping:        Optional[MappingTableResponse] = None

        if mode in {"pseudo", "both"}:
            pseudo_text, token_map = self._pseudo_pass(text, sorted_ents, salt)
            mapping = MappingTableResponse(entries=token_map)

        if mode in {"full", "both"}:
            full_anon_text = self._full_anon_pass(text, sorted_ents)

        return pseudo_text, full_anon_text, mapping

    #  Step 1: Pseudo-anonymisation ─

    def _pseudo_pass(
        self,
        text:     str,
        entities: List[DetectedEntity],
        salt:     Optional[str],
    ) -> Tuple[str, List[MappingEntry]]:
        result = text
        token_map: List[MappingEntry] = []
        seen_originals: Dict[str, str] = {}

        for ent in entities:
            original = ent.text

            if original in seen_originals:
                token = seen_originals[original]
            elif original in self._vault:
                token = self._vault[original]
                seen_originals[original] = token
            else:
                token = self._generate_token(original, ent.entity_type, salt)
                seen_originals[original] = token
                self._vault[original]    = token
                self._reverse[token]     = original

                token_map.append(MappingEntry(
                    token=token,
                    original_value=original,
                    entity_type=ent.entity_type,
                    source=ent.source,
                    score=round(ent.score, 4),
                ))

            result = result[:ent.start] + token + result[ent.end:]

        return result, token_map

    #  Step 2: Full anonymisation 

    def _full_anon_pass(
        self,
        text:     str,
        entities: List[DetectedEntity],
    ) -> str:
        result = text
        for ent in entities:
            fn          = _generaliser_for_entity_type(ent.entity_type)
            replacement = fn(ent.text)
            result      = result[:ent.start] + replacement + result[ent.end:]
        return result

    #  Token generation 

    @staticmethod
    def _generate_token(
        original:    str,
        entity_type: str,
        salt:        Optional[str],
    ) -> str:
        prefix = _TOKEN_PREFIX.get(entity_type, "ENT")

        if salt:
            digest = hmac.new(
                key=salt.encode(),
                msg=original.encode(),
                digestmod=hashlib.sha256,
            ).hexdigest()[:8].upper()
        else:
            digest = secrets.token_hex(4).upper()

        return f"{prefix}_{digest}"

    #  Re-identification (audit only) ─

    def reidentify(self, pseudo_text: str) -> str:
        result = pseudo_text
        for token, original in self._reverse.items():
            result = result.replace(token, original)
        return result