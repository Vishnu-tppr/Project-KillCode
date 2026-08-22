"""FastAPI bridge for SkillRack scraper - serves JSON to Tampermonkey userscript.

Importers/callers:
- main.py: FastAPI app mounted as API server
- bridge_server.py (legacy): Old subprocess-based bridge, to be replaced

Affected API:
- GET /health -> HealthCheck
- GET /questions -> Question[] (with filters: language, level, section, limit, offset)
- POST /scrape -> ScrapeJobStatus (async job)
- GET /scrape/{job_id} -> ScrapeJobStatus
- GET /scrape -> ScrapeJobStatus[] (list jobs)
- POST /scrape/sync -> ScrapeResult (synchronous)
- GET /stats -> Dict[str, Any]

Data schemas:
- Question: level, language (mapped: CPP23, PYTHON311, etc.), section, problem_set, question, link, question_id, row, part
- ScrapeResult: questions[], total_found, scrape_timestamp, packs_scanned[], levels_scanned[], errors[], duration_seconds
- ScrapeJobStatus: job_id, status, result, error, started_at, completed_at
- ScrapeRequest: packs?, levels?, force_refresh
- QuestionsFilter: language?, level?, section?, limit, offset

User instruction: "Keep the local Flask/FastAPI bridge pattern used previously — the Python process scrapes SkillRack and exposes the results via a local HTTP API; Killcode.js (Tampermonkey) will later fetch from this API to render the UI"
"""

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .models import (
    Question,
    ScrapeResult,
    ScrapeJobStatus,
    HealthCheck,
    ScrapeRequest,
    QuestionsFilter,
)
from .scraper import run_scrape, SkillRackScraper
from .session import SkillRackSession
from .config import LANGUAGE_MAP

logger = logging.getLogger(__name__)

# In-memory job store (v1: no persistence)
_job_store: Dict[str, ScrapeJobStatus] = {}
_latest_result: Optional[ScrapeResult] = None
_scrape_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("SkillRack Scraper API starting...")
    yield
    logger.info("SkillRack Scraper API shutting down...")


app = FastAPI(
    title="SkillRack Scraper API",
    description="Local API bridge serving incomplete SkillRack questions to KillCode Tampermonkey",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for local file:// access (Tampermonkey runs in browser context)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helper Functions ────────────────────────────────────────────────

def apply_language_mapping(questions: List[Question]) -> List[Question]:
    """Apply language mapping to questions for API response."""
    mapped = []
    for q in questions:
        q_dict = q.model_dump()
        q_dict["language"] = LANGUAGE_MAP.get(q.language, q.language)
        mapped.append(Question(**q_dict))
    return mapped


def filter_questions(questions: List[Question], filters: QuestionsFilter) -> List[Question]:
    """Apply filters to question list."""
    filtered = questions
    if filters.language:
        filtered = [q for q in filtered if filters.language.lower() in q.language.lower()]
    if filters.level:
        filtered = [q for q in filtered if filters.level.lower() in q.level.lower()]
    if filters.section:
        filtered = [q for q in filtered if filters.section.lower() in q.section.lower()]
    return filtered[filters.offset : filters.offset + filters.limit]


async def run_scrape_job(job_id: str, request: ScrapeRequest):
    """Background task to run scrape and update job status."""
    global _latest_result
    job = _job_store[job_id]
    job.status = "running"
    job.started_at = datetime.utcnow()

    try:
        result = await run_scrape(
            packs=request.packs,
            levels=request.levels,
        )
        _latest_result = result
        job.status = "completed"
        job.result = result
        job.completed_at = datetime.utcnow()
        logger.info(f"Scrape job {job_id} completed: {result.total_found} questions")
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.completed_at = datetime.utcnow()
        logger.error(f"Scrape job {job_id} failed: {e}")


# ─── Endpoints ───────────────────────────────────────────────────────

@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint."""
    return HealthCheck()


@app.get("/questions", response_model=List[Question])
async def get_questions(
    language: Optional[str] = Query(None, description="Filter by language (e.g., Python, C++)"),
    level: Optional[str] = Query(None, description="Filter by level (e.g., STARTER, EASY)"),
    section: Optional[str] = Query(None, description="Filter by section name"),
    limit: int = Query(100, ge=1, le=1000, description="Max results"),
    offset: int = Query(0, ge=0, description="Results offset"),
):
    """Get scraped questions with optional filtering.

    Returns questions with language field mapped to normalized names (CPP23, PYTHON311, etc.)
    Requires a prior POST /scrape to populate data — returns 503 if no data yet.
    """
    global _latest_result

    if _latest_result is None:
        raise HTTPException(
            503,
            detail={
                "error": "No data available",
                "hint": "Run POST /scrape first to populate question data, "
                        "then poll GET /scrape/{job_id} until status=completed.",
            },
        )

    filters = QuestionsFilter(
        language=language,
        level=level,
        section=section,
        limit=limit,
        offset=offset,
    )

    mapped_questions = apply_language_mapping(_latest_result.questions)
    filtered = filter_questions(mapped_questions, filters)

    return filtered


@app.post("/scrape", response_model=ScrapeJobStatus)
async def start_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """Trigger a fresh scrape job.

    Returns job ID immediately; check status with GET /scrape/{job_id}
    """
    global _latest_result

    if request.force_refresh:
        _latest_result = None

    if _scrape_lock.locked():
        raise HTTPException(409, "Scrape already in progress. Check /scrape/{job_id} for status.")

    job_id = str(uuid.uuid4())[:8]
    job = ScrapeJobStatus(job_id=job_id, status="pending")
    _job_store[job_id] = job

    background_tasks.add_task(run_scrape_job, job_id, request)

    return job


@app.get("/scrape/{job_id}", response_model=ScrapeJobStatus)
async def get_scrape_status(job_id: str):
    """Get status of a scrape job."""
    if job_id not in _job_store:
        raise HTTPException(404, "Job not found")
    return _job_store[job_id]


@app.get("/scrape", response_model=List[ScrapeJobStatus])
async def list_scrape_jobs():
    """List all scrape jobs."""
    return list(_job_store.values())


@app.delete("/scrape/{job_id}")
async def delete_scrape_job(job_id: str):
    """Delete a scrape job from history."""
    if job_id not in _job_store:
        raise HTTPException(404, "Job not found")
    del _job_store[job_id]
    return {"success": True}


@app.post("/scrape/sync", response_model=ScrapeResult)
async def scrape_sync(request: ScrapeRequest):
    """Run scrape synchronously and return results directly.

    Use for simple one-off scrapes without job tracking.
    """
    global _latest_result

    async with _scrape_lock:
        if request.force_refresh:
            _latest_result = None

        result = await run_scrape(packs=request.packs, levels=request.levels)
        _latest_result = result
        return result


@app.get("/stats", response_model=Dict[str, Any])
async def get_stats():
    """Get statistics about scraped data."""
    global _latest_result

    if _latest_result is None:
        return {
            "total_questions": 0,
            "packs_scanned": [],
            "levels_scanned": [],
            "last_scrape": None,
            "errors": [],
        }

    return {
        "total_questions": _latest_result.total_found,
        "packs_scanned": _latest_result.packs_scanned,
        "levels_scanned": _latest_result.levels_scanned,
        "last_scrape": _latest_result.scrape_timestamp.isoformat(),
        "errors": _latest_result.errors,
        "duration_seconds": _latest_result.duration_seconds,
    }


# ─── Main ────────────────────────────────────────────────────────────

def main():
    """Run the API server (for direct execution)."""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()