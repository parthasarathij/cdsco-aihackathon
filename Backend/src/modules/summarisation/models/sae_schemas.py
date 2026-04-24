from typing import Optional
from pydantic import BaseModel, Field
from .schemas import FieldResult, OverallSummary
from src.utils.logger import get_logger
logger = get_logger(__name__)

class PatientDetails(BaseModel):
    age: FieldResult
    gender: FieldResult
    medical_history: FieldResult

class DrugDetails(BaseModel):
    suspected_drug: FieldResult
    indication: FieldResult
    dosage: FieldResult

class AdverseEventDetails(BaseModel):
    event_description: FieldResult
    event_onset: FieldResult
    severity: FieldResult
    seriousness: FieldResult

class OutcomeDetails(BaseModel):
    result: FieldResult
    action_taken: FieldResult
    dechallenge_rechallenge: FieldResult

class RegulatoryFlags(BaseModel):
    expectedness: FieldResult
    listedness: FieldResult
    risk_signal: FieldResult

class SAECaseDetails(BaseModel):
    case_id: FieldResult
    patient_details: PatientDetails
    drug_details: DrugDetails
    adverse_event: AdverseEventDetails
    outcome: OutcomeDetails
    causality_assessment: FieldResult
    reporting_source: FieldResult
    regulatory_flags: RegulatoryFlags
    case_narrative_summary: FieldResult
    overall_summary: Optional[OverallSummary] = None

class SAECaseWrapper(BaseModel):
    case: SAECaseDetails
