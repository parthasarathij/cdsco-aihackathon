from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from typing import Dict, List, Literal, TypedDict

EntityCategory = Literal["PII", "PHI", "PII+PHI"]


class EntityField(TypedDict):
    label: str
    entity_type: str
    category: EntityCategory


def _canon(label: str) -> str:
    """
    Convert a human label to a stable ENTITY_TYPE identifier.
    Keeps alphanumerics, converts everything else to underscores, collapses repeats.
    """
    import re

    s = label.strip().upper()
    s = re.sub(r"[^A-Z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


# Final entity fields (from your latest table).
# - label:      human-friendly name
# - entity_type: stable identifier used in code/outputs
# - category:   PII | PHI | PII+PHI
FINAL_ENTITY_FIELDS: List[EntityField] = [
    {"label": "Applicant / sponsor name", "entity_type": _canon("Applicant / sponsor name"), "category": "PII"},
    {"label": "Signatory name", "entity_type": _canon("Signatory name"), "category": "PII"},
    {"label": "Signatory initials", "entity_type": _canon("Signatory initials"), "category": "PII"},
    {"label": "Signature", "entity_type": _canon("Signature"), "category": "PII"},
    {"label": "Sponsor address", "entity_type": _canon("Sponsor address"), "category": "PII"},
    {"label": "Sponsor contact email / phone", "entity_type": _canon("Sponsor contact email / phone"), "category": "PII"},
    {"label": "Legal representative", "entity_type": _canon("Legal representative"), "category": "PII"},
    {"label": "Regulatory contact", "entity_type": _canon("Regulatory contact"), "category": "PII"},
    {"label": "Patient name (regional forms)", "entity_type": _canon("Patient name (regional forms)"), "category": "PHI"},
    {"label": "Patient address", "entity_type": _canon("Patient address"), "category": "PHI"},
    {"label": "IND/NDA number", "entity_type": _canon("IND/NDA number"), "category": "PHI"},
    {"label": "Document author", "entity_type": _canon("Document author"), "category": "PII"},
    {"label": "Document approver", "entity_type": _canon("Document approver"), "category": "PII"},
    {"label": "Creation / revision date", "entity_type": _canon("Creation / revision date"), "category": "PII"},
    {"label": "Watermark text", "entity_type": _canon("Watermark text"), "category": "PII"},
    {"label": "Author name", "entity_type": _canon("Author name"), "category": "PII"},
    {"label": "Reviewer name", "entity_type": _canon("Reviewer name"), "category": "PII"},
    {"label": "Investigator name", "entity_type": _canon("Investigator name"), "category": "PII"},
    {"label": "Sponsor name", "entity_type": _canon("Sponsor name"), "category": "PII"},
    {"label": "Patient identifiers (clinical summary)", "entity_type": _canon("Patient identifiers (clinical summary)"), "category": "PHI"},
    {"label": "Subject ID", "entity_type": _canon("Subject ID"), "category": "PHI"},
    {"label": "Diagnosis / condition", "entity_type": _canon("Diagnosis / condition"), "category": "PHI"},
    {"label": "Adverse event narrative", "entity_type": _canon("Adverse event narrative"), "category": "PHI"},
    {"label": "Lab results (summary tables)", "entity_type": _canon("Lab results (summary tables)"), "category": "PHI"},
    {"label": "Protocol number", "entity_type": _canon("Protocol number"), "category": "PII"},
    {"label": "EudraCT number", "entity_type": _canon("EudraCT number"), "category": "PII"},
    {"label": "CRO name", "entity_type": _canon("CRO name"), "category": "PII"},
    {"label": "Document version / date", "entity_type": _canon("Document version / date"), "category": "PII"},
    {"label": "Manufacturer name", "entity_type": _canon("Manufacturer name"), "category": "PII"},
    {"label": "Manufacturer address", "entity_type": _canon("Manufacturer address"), "category": "PII"},
    {"label": "Qualified person (QP) name", "entity_type": _canon("Qualified person (QP) name"), "category": "PII"},
    {"label": "QP signature", "entity_type": _canon("QP signature"), "category": "PII"},
    {"label": "Contract lab name", "entity_type": _canon("Contract lab name"), "category": "PII"},
    {"label": "Contract lab address", "entity_type": _canon("Contract lab address"), "category": "PII"},
    {"label": "Sponsor name / address", "entity_type": _canon("Sponsor name / address"), "category": "PII"},
    {"label": "Document author / approver", "entity_type": _canon("Document author / approver"), "category": "PII"},
    {"label": "Human-derived donor info", "entity_type": _canon("Human-derived donor info"), "category": "PHI"},
    {"label": "Batch / lot number (if traceable)", "entity_type": _canon("Batch / lot number (if traceable)"), "category": "PII"},
    {"label": "File path / watermark", "entity_type": _canon("File path / watermark"), "category": "PII"},
    {"label": "Study director name", "entity_type": _canon("Study director name"), "category": "PII"},
    {"label": "Lab personnel names", "entity_type": _canon("Lab personnel names"), "category": "PII"},
    {"label": "Contract lab name / address", "entity_type": _canon("Contract lab name / address"), "category": "PII"},
    {"label": "Principal investigator", "entity_type": _canon("Principal investigator"), "category": "PII"},
    {"label": "Human-derived sample donor", "entity_type": _canon("Human-derived sample donor"), "category": "PHI"},
    {"label": "Donor genetic info", "entity_type": _canon("Donor genetic info"), "category": "PHI"},
    {"label": "Study report number", "entity_type": _canon("Study report number"), "category": "PII"},
    {"label": "Study dates", "entity_type": _canon("Study dates"), "category": "PII"},
    {"label": "Version / file path", "entity_type": _canon("Version / file path"), "category": "PII"},
    {"label": "Patient / subject ID", "entity_type": _canon("Patient / subject ID"), "category": "PII+PHI"},
    {"label": "Subject full name", "entity_type": _canon("Subject full name"), "category": "PII+PHI"},
    {"label": "Date of birth", "entity_type": _canon("Date of birth"), "category": "PII+PHI"},
    {"label": "Age", "entity_type": _canon("Age"), "category": "PII+PHI"},
    {"label": "Gender", "entity_type": _canon("Gender"), "category": "PHI"},
    {"label": "Medical record number", "entity_type": _canon("Medical record number"), "category": "PHI"},
    {"label": "Randomization code", "entity_type": _canon("Randomization code"), "category": "PHI"},
    {"label": "Medication / dosage", "entity_type": _canon("Medication / dosage"), "category": "PHI"},
    {"label": "Lab results", "entity_type": _canon("Lab results"), "category": "PHI"},
    {"label": "Vital signs", "entity_type": _canon("Vital signs"), "category": "PHI"},
    {"label": "Hospitalization / admission date", "entity_type": _canon("Hospitalization / admission date"), "category": "PHI"},
    {"label": "Informed consent date", "entity_type": _canon("Informed consent date"), "category": "PII+PHI"},
    {"label": "Screening / enrollment date", "entity_type": _canon("Screening / enrollment date"), "category": "PHI"},
    {"label": "Follow-up / withdrawal date", "entity_type": _canon("Follow-up / withdrawal date"), "category": "PHI"},
    {"label": "Death date", "entity_type": _canon("Death date"), "category": "PHI"},
    {"label": "Genetic information", "entity_type": _canon("Genetic information"), "category": "PHI"},
    {"label": "Mental health info", "entity_type": _canon("Mental health info"), "category": "PHI"},
    {"label": "Substance use", "entity_type": _canon("Substance use"), "category": "PHI"},
    {"label": "Pregnancy status", "entity_type": _canon("Pregnancy status"), "category": "PHI"},
    {"label": "Surgery details", "entity_type": _canon("Surgery details"), "category": "PHI"},
    {"label": "Investigator number", "entity_type": _canon("Investigator number"), "category": "PII"},
    {"label": "Site name / number", "entity_type": _canon("Site name / number"), "category": "PII"},
    {"label": "Site address", "entity_type": _canon("Site address"), "category": "PII"},
    {"label": "Ethics committee name", "entity_type": _canon("Ethics committee name"), "category": "PII"},
    {"label": "Health plan / insurance ID", "entity_type": _canon("Health plan / insurance ID"), "category": "PII"},
    {"label": "IP address", "entity_type": _canon("IP address"), "category": "PII"},
]


def entity_type_category_map() -> Dict[str, EntityCategory]:
    return {item["entity_type"]: item["category"] for item in FINAL_ENTITY_FIELDS}


def entity_types() -> List[str]:
    return sorted({item["entity_type"] for item in FINAL_ENTITY_FIELDS})

