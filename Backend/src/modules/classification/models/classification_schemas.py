from pydantic import BaseModel
from typing import List, Optional
from .schemas import FieldResult
from src.utils.logger import get_logger
logger = get_logger(__name__)

class ClassificationData(BaseModel):
    seriousness: FieldResult
    priority: FieldResult
    classification_source: str
    causality: FieldResult
    expectedness: FieldResult
    # Additional fields for full view
    case_id: Optional[FieldResult] = None
    suspected_drug: Optional[FieldResult] = None
    event_description: Optional[FieldResult] = None
    outcome: Optional[FieldResult] = None
    patient_age: Optional[FieldResult] = None
    patient_gender: Optional[FieldResult] = None
    reporter: Optional[FieldResult] = None
    event_onset: Optional[FieldResult] = None

class DuplicateDetection(BaseModel):
    is_duplicate: bool
    duplicate_of: str
    similarity_score: float
    reason: str

class RegulatoryData(BaseModel):
    alert_flag: str
    regulatory_action: str

class ClassificationResponse(BaseModel):
    file_name: str
    classification: ClassificationData
    duplicate_detection: DuplicateDetection
    regulatory: RegulatoryData
