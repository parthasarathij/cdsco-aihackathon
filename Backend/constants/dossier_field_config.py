from __future__ import annotations
from utils.logger import get_logger
logger = get_logger(__name__)

FIELDS: list[dict] = [
    {
        "id": 1,
        "name": "Strength of product",
        "anchors": ["strength", "mg", "mcg", "ml", "dose"],
    },
    {
        "id": 2,
        "name": "Name of product",
        "anchors": ["product name", "trade name", "brand name", "inn"],
    },
    {
        "id": 3,
        "name": "Dosage form",
        "anchors": ["dosage form", "pharmaceutical form", "tablet", "capsule", "injection"],
    },
    {
        "id": 4,
        "name": "Applicant name",
        "anchors": ["applicant", "marketing authorisation holder", "mah", "sponsor"],
    },
    {
        "id": 5,
        "name": "Finished product manufacturer site",
        "anchors": ["finished product manufacturer", "fp manufacturer", "manufacturing site", "batch release"],
    },
    {
        "id": 6,
        "name": "Drug substance manufacturer site",
        "anchors": ["drug substance manufacturer", "active substance manufacturer", "ds manufacturer"],
    },
    {
        "id": 7,
        "name": "Indication",
        "anchors": ["indication", "therapeutic indication", "intended use", "treatment of"],
    },
    {
        "id": 8,
        "name": "Stability data (months)",
        "anchors": ["stability", "stability study", "long-term", "accelerated", "months"],
    },
    {
        "id": 9,
        "name": "Shelf life",
        "anchors": ["shelf life", "retest period", "expiry", "use before"],
    },
    {
        "id": 10,
        "name": "Bioequivalence tests",
        "anchors": ["bioequivalence", "be study", "biowaver", "bcs", "comparative ba"],
    },
]
