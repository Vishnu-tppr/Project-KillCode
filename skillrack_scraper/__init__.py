"""SkillRack Scraper - Find incomplete/unsolved SkillRack questions.

A modern Python rewrite of the shell-based SkillRack scraper with:
- Async HTTP client (httpx) with retry/backoff
- Structured JSON output schema
- FastAPI bridge for Tampermonkey consumption
- Comprehensive unit tests for HTML parsing
"""

try:
    from .config import (
        CODETUTOR_BASE,
        CODETRACK_BASE_TEMPLATE,
        CODENV_URL,
        PACKS,
        CODETRACK_LEVELS,
        LANGUAGE_MAP,
    )
    from .models import Question, ScrapeResult, ScrapeJobStatus, HealthCheck
    from .scraper import SkillRackScraper, run_scrape
    from .session import SkillRackSession
except (ImportError, ValueError):
    from config import (
        CODETUTOR_BASE,
        CODETRACK_BASE_TEMPLATE,
        CODENV_URL,
        PACKS,
        CODETRACK_LEVELS,
        LANGUAGE_MAP,
    )
    from models import Question, ScrapeResult, ScrapeJobStatus, HealthCheck
    from scraper import SkillRackScraper, run_scrape
    from session import SkillRackSession

__version__ = "1.0.0"
__all__ = [
    "CODETUTOR_BASE",
    "CODETRACK_BASE_TEMPLATE",
    "CODENV_URL",
    "PACKS",
    "CODETRACK_LEVELS",
    "LANGUAGE_MAP",
    "Question",
    "ScrapeResult",
    "ScrapeJobStatus",
    "HealthCheck",
    "SkillRackScraper",
    "run_scrape",
    "SkillRackSession",
]