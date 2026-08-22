"""Pydantic models for SkillRack scraper JSON schema."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


def _utcnow() -> datetime:
    """Timezone-aware UTC datetime (replaces deprecated datetime.utcnow())."""
    return datetime.now(timezone.utc)


class Question(BaseModel):
    """Single question entry matching the required JSON schema for Tampermonkey API."""
    level: str = Field(..., description="Difficulty/level (e.g., STARTER, VERY-EASY, EASY, AVERAGE, COURSE, Prime)")
    language: str = Field(..., description="Normalized language name (e.g., CPP23, PYTHON311, C17, JAVA21, SQL)")
    section: str = Field(..., description="Section/sub-challenge name (e.g., C++ Primer, Python - STARTER)")
    problem_set: str = Field(..., description="Problem set identifier (e.g., 'C++ Programming C++ Primer C++ - S001', 'Challenges Count: 10')")
    question: str = Field(..., description="Full question title with ID (e.g., 'C++ Programming C++ Primer CW004 - MFIB - Swap Unit Digits (Id-11374)')")
    link: str = Field(..., description="Direct URL to the problem solve page")

    model_config = {"extra": "allow"}


class QuestionRaw(BaseModel):
    """Internal raw question with extra fields for processing."""
    level: str
    language: str
    language_mapped: Optional[str] = None
    section: str
    problem_set: str
    question: str
    link: str
    question_id: Optional[str] = None
    row: Optional[int] = None
    part: Optional[str] = None

    model_config = {"extra": "allow"}


class ScrapeResult(BaseModel):
    """Result of a scrape operation."""
    questions: List[Question] = Field(default_factory=list)
    total_found: int = 0
    scrape_timestamp: datetime = Field(default_factory=_utcnow)
    packs_scanned: List[str] = Field(default_factory=list)
    levels_scanned: List[int] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    duration_seconds: Optional[float] = None


class ScrapeJobStatus(BaseModel):
    """Status of an async scrape job."""
    job_id: str
    status: str  # "pending", "running", "completed", "failed"
    result: Optional[ScrapeResult] = None
    error: Optional[str] = None
    started_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None


class HealthCheck(BaseModel):
    """Health check response."""
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=_utcnow)
    version: str = "1.0.0"


# API request/response models
class ScrapeRequest(BaseModel):
    """Request to trigger a scrape."""
    packs: Optional[List[int]] = Field(None, description="Pack indices to scrape (0-6), None for all")
    levels: Optional[List[int]] = Field(None, description="CODETRACK levels to scrape, None for all")
    force_refresh: bool = Field(False, description="Ignore cache and force fresh scrape")


class QuestionsFilter(BaseModel):
    """Filter parameters for questions query."""
    language: Optional[str] = None
    level: Optional[str] = None
    section: Optional[str] = None
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)