from typing import Literal
import uuid

from pydantic import BaseModel, Field


class AnalysisResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    classification: Literal["AI-generated", "Likely human"]
    confidence: float = Field(ge=0, le=1)
    duration_seconds: float = Field(ge=0, le=60)
    truncated: bool
    file_name: str
    model_id: str
    temporary_file_purged: bool = True