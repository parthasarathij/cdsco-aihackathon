from typing import List, Optional
from pydantic import BaseModel, Field
from .schemas import SourceReference, FieldResult, OverallSummary
from src.utils.logger import get_logger
logger = get_logger(__name__)

class ArrayFieldResult(BaseModel):
    value: List[str]
    confidence: str = Field(..., description="low, medium, or high")
    source: List[SourceReference]

class MeetingDetails(BaseModel):
    meeting_type: FieldResult
    date: FieldResult
    participants: ArrayFieldResult

class KeyDiscussion(BaseModel):
    point: FieldResult

class Decision(BaseModel):
    decision: FieldResult
    decision_type: FieldResult

class ActionItem(BaseModel):
    task: FieldResult
    responsible_party: FieldResult
    deadline: FieldResult

class MeetingSummaryDetails(BaseModel):
    meeting_details: MeetingDetails
    agenda_summary: FieldResult
    key_discussions: List[KeyDiscussion]
    decisions: List[Decision]
    action_items: List[ActionItem]
    next_steps: FieldResult
    overall_summary: Optional[OverallSummary] = None

class MeetingWrapper(BaseModel):
    meeting: MeetingSummaryDetails
