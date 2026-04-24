from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

# --- Field 2: INN / product name aliases (lowercase keys & values) ---
INN_ALIASES: dict[str, str] = {
    "acetaminophen": "paracetamol",
    "apap": "paracetamol",
    "paracetamol": "paracetamol",
    "acetylsalicylic acid": "aspirin",
    "asa": "aspirin",
    "aspirin": "aspirin",
    "salbutamol": "albuterol",
    "albuterol": "albuterol",
}

# Salt / form suffixes to strip when deriving base INN token (lowercase)
SALT_SUFFIXES: tuple[str, ...] = (
    "hydrochloride",
    "hcl",
    "sodium",
    "maleate",
    "mesylate",
    "besylate",
    "tartrate",
    "citrate",
    "fumarate",
    "succinate",
    "sulfate",
    "phosphate",
    "acetate",
)

# --- Field 3: Dosage form → group code (canonical upper token) ---
# OS-TAB, OS-CAP, PAR, OL, TOP — match longest / most specific phrases first in code.
DOSAGE_FORM_GROUP_PHRASES: dict[str, tuple[str, ...]] = {
    "OS-TAB": (
        "extended-release tablet",
        "immediate release tablet",
        "film-coated tablet",
        "fc tablet",
        "coated tablet",
        "oral tablet",
        "tablet",
    ),
    "OS-CAP": (
        "hard gelatin capsule",
        "hard capsule",
        "hgc",
        "capsule",
    ),
    "PAR": (
        "solution for iv infusion",
        "iv infusion",
        "solution for injection",
        "sterile solution",
        "lyophilized powder for injection",
        "powder for injection",
        "injection",
        "infusion",
    ),
    "OL": (
        "oral suspension",
        "oral solution",
        "suspension",
        "syrup",
    ),
    "TOP": (
        "topical cream",
        "topical gel",
        "ointment",
        "cream",
        "gel",
    ),
}

# Sub-type hints for NEEDS_REVIEW when same group but wording differs materially
DOSAGE_FORM_SUBTYPE_HINTS: dict[str, tuple[str, ...]] = {
    "OS-TAB": ("film-coated", "extended-release", "immediate release", "chewable", "dispersible", "orodispersible"),
    "OS-CAP": ("hard gelatin", "soft capsule", "modified release"),
    "PAR": ("lyophilized", "powder for", "concentrate for", "emulsion for injection"),
}

# --- Field 7: Indication synonyms → canonical label ---
INDICATION_SYNONYMS: dict[str, tuple[str, ...]] = {
    "hypertension": (
        "high blood pressure",
        "htn",
        "arterial hypertension",
        "essential hypertension",
    ),
    "type 2 diabetes mellitus": (
        "t2dm",
        "niddm",
        "non-insulin dependent diabetes",
        "diabetes type 2",
        "type ii diabetes",
        "type 2 diabetes",
    ),
    "pneumonia": (
        "community-acquired pneumonia",
        "cap",
        "lower respiratory tract infection",
    ),
}

# --- Field 4: Applicant legal suffixes (lowercase, stripped after root) ---
APPLICANT_LEGAL_SUFFIXES: tuple[str, ...] = (
    "limited",
    "ltd",
    "incorporated",
    "inc",
    "corporation",
    "corp",
    "llc",
    "gmbh",
    "private",
    "pvt",
    "plc",
    "ag",
    "s.a.",
    "sa",
    "bv",
    "nv",
    "pty",
)

# --- Field 5 & 6: city / division noise keywords (for stripping after punctuation) ---
DIVISION_STRIP_KEYWORDS: tuple[str, ...] = (
    "division",
    "department",
    "plant",
    "facility",
    "plot",
    "survey",
    "pin",
    "zip",
    "india",
    "usa",
    "china",
)

# --- Field 10: Bioequivalence text → study code ---
BE_STUDY_PHRASES: dict[str, tuple[str, ...]] = {
    "BE-INVIVO": (
        "bioequivalence study",
        "be study",
        "comparative ba study",
        "comparative bioavailability",
        "in vivo be",
        "in-vivo be",
    ),
    "BE-WAIVER": (
        "bcs-based waiver",
        "bcs class",
        "biowaiver",
        "bio-waiver",
        "be waiver",
        "in vitro waiver",
    ),
    "BE-FAST": (
        "fasting be study",
        "be study under fasted",
        "fasted conditions",
        "fasting study",
    ),
    "BE-FED": (
        "fed state be study",
        "post-prandial be",
        "fed be",
        "fed study",
    ),
    "NO-BE": (
        "not applicable",
        " not required",
        "n/a",
        "na ",
        "no be",
    ),
}

# --- Proximity anchor regexes (case-insensitive); searched in order ---
FIELD_ANCHORS: dict[int, tuple[str, ...]] = {
    1: (
        r"strength\s*[:]",
        r"\bdose\s*[:]",
        r"dosage\s+strength",
        r"potency\s*[:]",
    ),
    2: (
        r"product\s+name\s*[:]",
        r"name\s+of\s+(the\s+)?product\s*[:]",
        r"proposed\s+name\s*[:]",
        r"invented\s+name\s*[:]",
    ),
    3: (
        r"dosage\s+form\s*[:]",
        r"pharmaceutical\s+form\s*[:]",
        r"formulation\s*[:]",
        r"dosage\s+form\b",
    ),
    4: (
        r"applicant\s*[:]",
        r"sponsor\s*[:]",
        r"marketing\s+authori[sz]ation\s+holder",
        r"mah\s*[:]",
    ),
    5: (
        r"finished\s+product\s+manufacturer",
        r"manufacturing\s+site",
        r"manufacturing\s+facility",
        r"drug\s+product\s+manufacturer",
    ),
    6: (
        r"drug\s+substance\s+manufacturer",
        r"active\s+substance\s+manufacturer",
        r"api\s+manufacturer",
        r"substance\s+manufacturer",
    ),
    7: (
        r"indication\s*[:]",
        r"therapeutic\s+indication\s*[:]",
        r"intended\s+use\s*[:]",
        r"clinical\s+indication",
    ),
    8: (
        r"stability\s+data",
        r"stability\s+study",
        r"stability\s+period",
        r"long\s*[- ]?term\s+stability",
    ),
    9: (
        r"shelf\s*[- ]?life\s*[:]",
        r"shelf\s+life\b",
        r"expiry\s*[:]",
        r"retest\s+date",
    ),
    10: (
        r"bioequivalence",
        r"\bbe\s+study\b",
        r"biowaiver",
        r"bioavailability",
        r"bcs\s+based",
    ),
}

PROXIMITY_CHARS: int = 200
