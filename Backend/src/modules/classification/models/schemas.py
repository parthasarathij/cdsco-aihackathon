from typing import List, Optional
from pydantic import BaseModel, Field
from src.utils.logger import get_logger
logger = get_logger(__name__)

class SourceReference(BaseModel):
    file: str
    page: int
    chunk_id: str
    text_snippet: str

class FieldResult(BaseModel):
    value: str
    confidence: str = Field(..., description="low, medium, or high")
    source: List[SourceReference]

class ApplicationDetails(BaseModel):
    drug_name: FieldResult
    applicant: FieldResult
    dosage_form: FieldResult
    strength: FieldResult
    indication: FieldResult
    application_type: FieldResult

class QualitySummary(BaseModel):
    api_compliance: FieldResult
    manufacturing_process: FieldResult
    stability: FieldResult
    key_quality_findings: FieldResult

class BioequivalenceSummary(BaseModel):
    study_conducted: FieldResult
    study_design: FieldResult
    result: FieldResult
    conclusion: FieldResult

class RegulatorySummary(BaseModel):
    key_observations: FieldResult
    deficiencies: FieldResult
    risk_flags: FieldResult
    compliance_status: FieldResult

class FinalStatus(BaseModel):
    completeness: FieldResult
    recommendation: FieldResult
    review_confidence: FieldResult

class OverallSummarySource(BaseModel):
    section: str
    reason: str

class OverallSummary(BaseModel):
    value: str
    confidence: str = Field(..., description="low, medium, or high")
    source: List[OverallSummarySource]

class FinalSummaryResponse(BaseModel):
    application_details: ApplicationDetails
    quality_summary: QualitySummary
    bioequivalence_summary: BioequivalenceSummary
    regulatory_summary: RegulatorySummary
    final_status: FinalStatus
    overall_summary: Optional[OverallSummary] = None
