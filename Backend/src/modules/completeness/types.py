from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

from dataclasses import dataclass
from typing import Literal, Optional


Applicability = Literal["Mandatory", "Conditional", "Optional"]
MatchStatus = Literal["matched", "needs_user_confirmation", "missing"]


@dataclass(frozen=True)
class ChecklistItem:
    module: str  # e.g. "Module 1"
    section_id: str  # e.g. "1.1"
    title: str
    description: str
    applicability: Applicability


@dataclass(frozen=True)
class DocumentMatch:
    module: str
    checklist_section_id: str
    checklist_title: str
    checklist_description: str
    applicability: Applicability
    status: MatchStatus
    score: float
    matched_file: Optional[str]
    llm_reason: Optional[str] = None
    boost_applied: Optional[str] = None
    nomination_count: int = 0
    match_method: str = "primary"
    clarity_score: Optional[float] = None

