from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from typing import List, Optional
from pydantic import BaseModel
from enum import Enum


class AnonymisationMode(str, Enum):
    pseudo = "pseudo"
    full   = "full"
    both   = "both"


class DetectedEntity(BaseModel):
    text:        str
    entity_type: str
    start:       int
    end:         int
    score:       float
    source:      str        # "regex" | "ner" | "hybrid"


class MappingEntry(BaseModel):
    token:          str
    original_value: str
    entity_type:    str
    source:         Optional[str]   = None
    score:          Optional[float] = None


class MappingTableResponse(BaseModel):
    entries: List[MappingEntry]


class AnonymisedChange(BaseModel):
    """One record per unique value that was changed in the document."""
    serial_no:        int
    entity_type:      str
    original_value:   str
    pseudo_value:     Optional[str]   = None
    full_anon_value:  Optional[str]   = None
    detection_source: str
    confidence:       float
    occurrences:      int


class DocumentRequest(BaseModel):
    text:           str
    mode:           AnonymisationMode = AnonymisationMode.both
    salt:           Optional[str]     = None
    return_mapping: bool              = True


class DocumentResponse(BaseModel):
    original_text:        str
    total_entities_found: int
    total_values_changed: int
    changes:              List[AnonymisedChange]
    pseudo_document:      Optional[str]                   = None
    full_anon_document:   Optional[str]                   = None
    entities_detected:    Optional[List[DetectedEntity]]  = None
    mapping_table:        Optional[MappingTableResponse]  = None
    mapping_excel_url:    Optional[str]                   = None
    message:              str                             = ""