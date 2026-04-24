from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re
from typing import List, Tuple

#  Sub-patterns (value fragments, used inside capturing group 1) 

_DATE_VALUE = (
    r"(?:"
    r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|"
    r"\d{4}[-/]\d{1,2}[-/]\d{1,2}|"
    r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
    r"[-.,\s]+\d{2,4}"
    r")"
)

# Aadhaar only when explicitly tied to UID / Aadhaar (Indian context)
_AADHAAR_VALUE = r"\d{4}[ -]?\d{4}[ -]?\d{4}"

_PAN_VALUE = r"[A-Z]{5}[0-9]{4}[A-Z]"

# India + US/Canada style + generic international (label still required except standalone row)
_PHONE_IN = r"(?:\+91[\s\-]?[6-9]\d{9})\b"
_PHONE_US = r"(?:\+1[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})\b"
_PHONE_GEN = (
    r"(?:\+\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)\d{2,4}[\s\-]?\d{2,8}\b"
)
_PHONE_VALUE = rf"(?:{_PHONE_US}|{_PHONE_IN}|{_PHONE_GEN})"

# Standalone IPv4 (no "IP address" label) — lower score; avoids missing IPs in tables
_IPV4 = r"(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)"

_EMAIL_VALUE = r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}"

# EudraCT-style codes
_EUDRACT_VALUE = r"\d{4}-\d{6}-\d{2}"

# Entity types that represent PHI-related dates (labeled captures only).
PHI_DATE_ENTITY_TYPES: frozenset[str] = frozenset({
    "DATE_OF_BIRTH",
    "HOSPITALIZATION_ADMISSION_DATE",
    "INFORMED_CONSENT_DATE",
    "SCREENING_ENROLLMENT_DATE",
    "FOLLOW_UP_WITHDRAWAL_DATE",
    "DEATH_DATE",
    "STUDY_DATES",
})


def _lv(label: str, value_re: str) -> str:
    """Label(s) + delimiter + captured value."""
    return rf"(?i)(?:{label})\s*[:#]?\s*({value_re})"


# (entity_type, pattern, base_score)
_LABELED_DEFS: List[Tuple[str, str, float]] = [
    #  PHI dates (explicit labels only; no creation/revision/version) 
    (
        "DATE_OF_BIRTH",
        _lv(r"Date\s*of\s*birth|D\.?\s*O\.?\s*B\.?|DOB|Born\s*(?:on)?", _DATE_VALUE),
        0.94,
    ),
    (
        "HOSPITALIZATION_ADMISSION_DATE",
        _lv(
            r"Hospitalization\s*date|Admission\s*date|Date\s*of\s*admission|"
            r"Admitted\s*(?:on)?",
            _DATE_VALUE,
        ),
        0.92,
    ),
    (
        "INFORMED_CONSENT_DATE",
        _lv(r"Informed\s*consent\s*date|Consent\s*date|ICF\s*date", _DATE_VALUE),
        0.92,
    ),
    (
        "SCREENING_ENROLLMENT_DATE",
        _lv(
            r"Screening\s*date|Enrollment\s*date|Date\s*of\s*enrollment|"
            r"Enrolled\s*(?:on)?",
            _DATE_VALUE,
        ),
        0.91,
    ),
    (
        "FOLLOW_UP_WITHDRAWAL_DATE",
        _lv(
            r"Follow[\s-]*up\s*date|Withdrawal\s*date|Date\s*of\s*withdrawal",
            _DATE_VALUE,
        ),
        0.91,
    ),
    (
        "DEATH_DATE",
        _lv(
            r"Date\s*of\s*death|Death\s*date(?:\s*\([^)]{0,120}\))?|"
            r"D\.?\s*O\.?\s*D\.?|Date\s*death",
            _DATE_VALUE,
        ),
        0.93,
    ),
    # Study-level dates: only when the document explicitly labels them (not every date in text)
    (
        "STUDY_DATES",
        _lv(r"Study\s*dates?", rf"{_DATE_VALUE}(?:\s*[-–to,]+\s*{_DATE_VALUE})?"),
        0.88,
    ),
    #  Identifiers & codes 
    (
        "PROTOCOL_NUMBER",
        _lv(
            r"Protocol\s*(?:number|no\.?|#|ID|Code)|Study\s*protocol|PROT\.?",
            r"[A-Z0-9][A-Z0-9\-]{2,40}",
        ),
        0.93,
    ),
    (
        "EUDRACT_NUMBER",
        _lv(r"Eudra\s*CT|EUDRACT", _EUDRACT_VALUE),
        0.95,
    ),
    (
        "IND_NDA_NUMBER",
        _lv(
            r"\bIND\b(?:\s*/\s*\bNDA\b)?\s*(?:number|no\.?|#)?|"
            r"\bNDA\b\s*(?:number|no\.?|#)?",
            r"[A-Z]{0,8}[\-/]?\d{4,12}|[A-Z]*\d{4,12}",
        ),
        0.92,
    ),
    (
        "SUBJECT_ID",
        _lv(
            r"Subject\s*ID|Subj(?:ect)?\.?\s*ID|SUB[\s\-]*ID|Subject\s*No\.?",
            r"[A-Z0-9][A-Z0-9\-]{2,24}",
        ),
        0.92,
    ),
    (
        "PATIENT_SUBJECT_ID",
        _lv(
            r"Patient\s*/\s*Subject\s*ID|Patient\s*ID|Pt\.?\s*ID|Patient\s*number",
            r"[A-Z0-9][A-Z0-9\-]{2,24}",
        ),
        0.91,
    ),
    (
        "MEDICAL_RECORD_NUMBER",
        _lv(
            r"\bMRN\b|Medical\s*record\s*(?:number|no\.?)?|Hospital\s*record\s*#",
            r"[A-Z0-9][A-Z0-9\-]{3,19}",
        ),
        0.91,
    ),
    (
        "RANDOMIZATION_CODE",
        _lv(
            r"Random(?:ization)?\s*(?:code|number|ID)|RND[\s\-]*(?:code|no\.?)?",
            r"[A-Z0-9]{3,20}",
        ),
        0.90,
    ),
    (
        "INVESTIGATOR_NUMBER",
        _lv(
            r"\bInvestigator\s*(?:number|no\.?|#|ID)|"
            r"(?<![A-Za-z])INV(?![A-Za-z])[\s\-]*(?:NO|Number|ID)?",
            r"[A-Z0-9\-]{2,20}",
        ),
        0.89,
    ),
    (
        "SITE_NAME_NUMBER",
        _lv(
            r"\bSite\s*name\b|\bSite\s*(?:number|no\.?|#|ID)\b|"
            r"(?<![A-Za-z])SITE[\s\-]*(?:ID|NO|Number)(?![A-Za-z])",
            r"[A-Za-z0-9][A-Za-z0-9\s\-',.&]{2,80}",
        ),
        0.88,
    ),
    (
        "STUDY_REPORT_NUMBER",
        _lv(r"Study\s*report\s*(?:number|no\.?|#)?", r"[A-Z0-9][A-Z0-9\-]{3,30}"),
        0.88,
    ),
    (
        "BATCH_LOT_NUMBER_IF_TRACEABLE",
        _lv(
            r"Batch\s*(?:number|no\.?|#)?|Lot\s*(?:number|no\.?|#)?",
            r"[A-Z0-9][A-Z0-9\-]{3,30}",
        ),
        0.85,
    ),
    (
        "HUMAN_DERIVED_DONOR_INFO",
        _lv(r"Donor\s*ID|Donor\s*[:#]", r"[A-Z0-9\-]{3,24}"),
        0.88,
    ),
    (
        "HUMAN_DERIVED_SAMPLE_DONOR",
        _lv(r"Sample\s*donor|Donor\s*sample", r"[A-Z0-9\-]{3,24}"),
        0.88,
    ),
    (
        "HEALTH_PLAN_INSURANCE_ID",
        _lv(
            r"Health\s*plan|Insurance\s*ID|Member\s*ID|Policy\s*#|Policy\s*number|HP[\s\-]*ID",
            r"[A-Z0-9][A-Z0-9\-]{4,22}",
        ),
        0.88,
    ),
    #  Indian IDs: label-gated 
    (
        "AADHAAR",
        _lv(
            r"Aadhaar|Aadhar|UID(?:\s*(?:number|no\.?))?|Unique\s*ID\s*(?:number)?",
            _AADHAAR_VALUE,
        ),
        0.96,
    ),
    (
        "PAN",
        _lv(r"PAN|P\.?\s*A\.?\s*N\.?|Permanent\s*account\s*(?:number|no\.?)?", _PAN_VALUE),
        0.96,
    ),
    (
        "PHONE",
        _lv(
            r"Sponsor\s*contact\s*(?:phone|tel|mobile|number)|"
            r"Regulatory\s*contact\s*(?:phone|tel|mobile|number)|"
            r"\bMobile\b|\bPhone\b|Tel(?:ephone)?|Contact\s*(?:number|no\.?)?|\bCell\b",
            _PHONE_VALUE,
        ),
        0.92,
    ),
    #  Network / path 
    (
        "IP_ADDRESS",
        _lv(r"IP\s*address|IPAddress", _IPV4),
        0.90,
    ),
    (
        "IP_ADDRESS",
        rf"(?i)\b({_IPV4})\b",
        0.82,
    ),
    (
        "FILE_PATH_WATERMARK",
        _lv(
            r"File\s*path|Path\s*[:#]?",
            r"(?:[A-Za-z]:|\\\\[\w\-.\\]+|/)[^\n\r]{0,240}|"
            r"'[^'\n\r]{1,240}'|\"[^\"\n\r]{1,240}\"",
        ),
        0.86,
    ),
    (
        "VERSION_FILE_PATH",
        _lv(r"Version\s*/\s*file\s*path", r"[A-Za-z]:\\[^\n\r]{1,200}|/[^\n\r]{1,200}"),
        0.86,
    ),
    #  Email (standalone remains high-precision; optional labeled contact) 
    (
        "SPONSOR_CONTACT_EMAIL_PHONE",
        _lv(
            r"Sponsor\s*contact\s*(?:e[\s-]*mail|email|phone)|"
            r"Regulatory\s*contact\s*(?:e[\s-]*mail|email)",
            rf"(?:{_EMAIL_VALUE}|{_PHONE_VALUE})",
        ),
        0.93,
    ),
    #  Clinical text (label → rest of line, bounded) 
    (
        "AGE",
        _lv(r"\bAge\b|Patient\s*age", r"\d{1,3}(?:\s*(?:years?|yrs?))?(?:\s*old)?"),
        0.90,
    ),
    (
        "GENDER",
        _lv(
            r"Gender|Sex",
            r"(?:Male\s*/\s*Female|Female\s*/\s*Male|Female|Male|Intersex|Other|"
            r"Non[\s-]*binary|\bM\b|\bF\b)\.?",
        ),
        0.88,
    ),
    (
        "VITAL_SIGNS",
        _lv(
            r"Vital\s*signs|BP|Blood\s*pressure|Heart\s*rate|SpO2|Temperature",
            r"[^\n\r\t]{1,80}",
        ),
        0.85,
    ),
    (
        "LAB_RESULTS",
        _lv(r"Lab\s*results?|Laboratory\s*results?|HbA1c", r"[^\n\r\t]{1,120}"),
        0.84,
    ),
    (
        "MEDICATION_DOSAGE",
        _lv(r"Medication|Dosage|Prescribed|Dose", r"[^\n\r\t]{1,120}"),
        0.84,
    ),
    (
        "DIAGNOSIS_CONDITION",
        _lv(
            r"Diagnosis|Condition|Primary\s*diagnosis|Secondary\s*diagnosis",
            r"[^\n\r\t]{2,160}",
        ),
        0.82,
    ),
    (
        "ADVERSE_EVENT_NARRATIVE",
        _lv(r"Adverse\s*event\s*(?:narrative|description|text)|AE\s*narrative", r"[^\n\r\t]{2,300}"),
        0.80,
    ),
    (
        "GENETIC_INFORMATION",
        _lv(r"Genetic\s*(?:information|test|mutation|variant)|BRCA", r"[^\n\r\t]{2,120}"),
        0.82,
    ),
    (
        "PREGNANCY_STATUS",
        _lv(r"Pregnancy|Pregnant|Gestational", r"[^\n\r\t]{2,80}"),
        0.82,
    ),
    (
        "SURGERY_DETAILS",
        _lv(r"Surgery|Surgical\s*procedure|Operation", r"[^\n\r\t]{2,120}"),
        0.80,
    ),
    (
        "MENTAL_HEALTH_INFO",
        _lv(r"Mental\s*health|Psychiatric|Depression|Anxiety\s*(?:disorder)?", r"[^\n\r\t]{2,120}"),
        0.78,
    ),
    (
        "SUBSTANCE_USE",
        _lv(r"Substance\s*use|Alcohol|Drug\s*use", r"[^\n\r\t]{2,100}"),
        0.78,
    ),
    #  Roles / orgs (label → value to EOL, bounded) 
    (
        "APPLICANT_SPONSOR_NAME",
        _lv(r"Applicant\s*/\s*Sponsor\s*name", r"[^\n\r\t]{2,120}"),
        0.82,
    ),
    (
        "SPONSOR_NAME",
        _lv(
            r"\bSponsor\s*/\s*Applicant\b(?!\s*address)|"
            r"\bSponsor\s*name\b(?!\s*/\s*address)|Name\s*of\s*sponsor",
            r"[^\n\r\t]{2,120}",
        ),
        0.82,
    ),
        (
            "CRO_NAME",
            _lv(r"CRO\s*(?:name)?|Contract\s*research\s*org(?:anisation)?", r"[^\n\r\t]{2,120}"),
            0.82,
        ),
        (
            "PRINCIPAL_INVESTIGATOR",
            _lv(r"Principal\s*investigator|PI\s*name", r"[^\n\r\t]{2,120}"),
            0.82,
        ),
        (
            "INVESTIGATOR_NAME",
            _lv(r"\bInvestigator\s+name(?!\s*/\s*number)", r"[^\n\r\t]{2,120}"),
            0.81,
        ),
        (
            "STUDY_DIRECTOR_NAME",
            _lv(r"Study\s*director", r"[^\n\r\t]{2,120}"),
            0.81,
        ),
        (
            "QUALIFIED_PERSON_QP_NAME",
            _lv(r"Qualified\s*person|QP\s*name", r"[^\n\r\t]{2,120}"),
            0.81,
        ),
        (
            "SIGNATORY_NAME",
            _lv(r"Signatory\s*name", r"[^\n\r\t]{2,120}"),
            0.81,
        ),
        (
            "LEGAL_REPRESENTATIVE",
            _lv(r"Legal\s*representative", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "REGULATORY_CONTACT",
            _lv(r"\bRegulatory\s+contact\b", r"[^\n\r\t]{2,160}"),
            0.80,
        ),
        (
            "DOCUMENT_AUTHOR",
            _lv(r"Document\s*author", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "DOCUMENT_APPROVER",
            _lv(r"Document\s*approver", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "DOCUMENT_AUTHOR_APPROVER",
            _lv(r"Document\s*author\s*/\s*approver", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "AUTHOR_NAME",
            _lv(r"Author\s*name", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "REVIEWER_NAME",
            _lv(r"Reviewer\s*name", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "MANUFACTURER_NAME",
            _lv(r"Manufacturer\s*name", r"[^\n\r\t]{2,120}"),
            0.80,
        ),
        (
            "CONTRACT_LAB_NAME",
            _lv(
                r"Contract\s*lab(?:\s*\([^)]{0,60}\))?(?:\s*name)?(?!\s*/\s*address)",
                r"[^\n\r\t]{2,200}",
            ),
            0.80,
        ),
        (
            "LAB_PERSONNEL_NAMES",
            _lv(r"Lab\s*personnel", r"[^\n\r\t]{2,120}"),
            0.78,
        ),
        (
            "ETHICS_COMMITTEE_NAME",
            _lv(
                r"Ethics\s*committee|\bIRB\b|\bIEC\b|Institutional\s*review\s*board",
                r"[^\n\r\t]{2,120}",
            ),
            0.80,
        ),
        (
            "SUBJECT_FULL_NAME",
            _lv(r"Subject\s*full\s*name|Subject\s*name", r"[^\n\r\t]{2,120}"),
            0.85,
        ),
        (
            "PATIENT_NAME_REGIONAL_FORMS",
            _lv(r"Patient\s*name", r"[^\n\r\t]{2,120}"),
            0.84,
        ),
        (
            "SPONSOR_ADDRESS",
            _lv(r"Sponsor\s*address", r"[^\n\r\t]{5,200}"),
            0.80,
        ),
        (
            "PATIENT_ADDRESS",
            _lv(r"Patient\s*address", r"[^\n\r\t]{5,200}"),
            0.82,
        ),
        (
            "SITE_ADDRESS",
            _lv(r"\bSite\s*address\b", r"[^\n\r\t]{5,200}"),
            0.80,
        ),
        (
            "MANUFACTURER_ADDRESS",
            _lv(r"Manufacturer\s*address", r"[^\n\r\t]{5,200}"),
            0.80,
        ),
        (
            "CONTRACT_LAB_ADDRESS",
            _lv(r"Contract\s*lab\s*address", r"[^\n\r\t]{5,200}"),
            0.80,
        ),
        (
            "SPONSOR_NAME_ADDRESS",
            _lv(r"Sponsor\s*name\s*/\s*address", r"[^\n\r\t]{5,220}"),
            0.80,
        ),
        (
            "CONTRACT_LAB_NAME_ADDRESS",
            _lv(r"Contract\s*lab\s*name\s*/\s*address", r"[^\n\r\t]{5,220}"),
            0.80,
        ),
        (
            "WATERMARK_TEXT",
            _lv(r"Watermark|Confidential\s*[-–]\s*", r"[^\n\r\t]{2,100}"),
            0.75,
        ),
        (
            "PATIENT_IDENTIFIERS_CLINICAL_SUMMARY",
            _lv(r"Patient\s*identifiers?", r"[^\n\r\t]{2,120}"),
            0.78,
        ),
        (
            "DONOR_GENETIC_INFO",
            _lv(
                r"Donor\s*genetic(?:\s*info(?:rmation)?)?",
                r"[^\n\r\t]{2,120}",
            ),
            0.82,
        ),
        (
            "LAB_RESULTS_SUMMARY_TABLES",
            _lv(r"Lab\s*results?\s*\(?summary", r"[^\n\r\t]{2,200}"),
            0.80,
        ),
        (
            "SIGNATORY_INITIALS",
            _lv(r"Signatory\s*initials", r"[A-Z](?:\s*\.?\s*[A-Z]){0,4}"),
            0.78,
        ),
        (
            "QP_SIGNATURE",
            _lv(r"QP\s*signature", r"[^\n\r\t]{1,80}"),
            0.72,
        ),
]

# Standalone email (high precision; not tied to a table label)
_EMAIL_STANDALONE: Tuple[str, str, float] = (
    "EMAIL",
    rf"(?i)\b({_EMAIL_VALUE})\b",
    0.96,
)


def compile_labeled_patterns() -> List[Tuple[str, re.Pattern, float]]:
    out: List[Tuple[str, re.Pattern, float]] = [
        (entity_type, re.compile(pat), score)
        for entity_type, pat, score in _LABELED_DEFS
    ]
    et, pat, sc = _EMAIL_STANDALONE
    out.append((et, re.compile(pat), sc))
    return out
