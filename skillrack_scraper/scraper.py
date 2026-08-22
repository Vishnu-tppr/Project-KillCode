"""High-level scrape orchestration for SkillRack.

Importers/callers:
- api.py: run_scrape() called by POST /scrape endpoint
- main.py: run_scrape() called by CLI 'scrape' command
- Direct usage: SkillRackScraper class for custom crawl configs

Affected API:
- run_scrape() -> ScrapeResult (Pydantic model with Question[])
- SkillRackScraper.crawl_all() -> ScrapeResult

Data schemas:
- Question: level, language, language_mapped, section, problem_set, question, link, question_id, row, part
- ScrapeResult: questions[], total_found, scrape_timestamp, packs_scanned[], levels_scanned[], errors[], duration_seconds

User instruction: "Rewrite the KillCode SkillRack scraper from scratch in Python... Design the new Python scraper's module structure, the JSON output schema... and the Flask/FastAPI bridge that will serve it."
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, timezone

from .session import SkillRackSession
from .parser import (
    extract_viewstate,
    extract_sub_challenges,
    extract_part_cards,
    extract_problems,
    extract_question_metadata,
    build_problem_set_name,
    build_question_title,
    is_session_expired,
)
from .models import Question, QuestionRaw, ScrapeResult
from .config import (
    PACKS,
    CODETRACK_LEVELS,
    CODETUTOR_BASE,
    CODETRACK_BASE_TEMPLATE,
    CODENV_URL,
    LANGUAGE_MAP,
    FORM_IDS,
)

logger = logging.getLogger(__name__)


@dataclass
class ScrapeProgress:
    """Track scrape progress for logging."""
    total_questions: int = 0
    packs_done: int = 0
    levels_done: int = 0
    errors: List[str] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)


class SkillRackScraper:
    """Orchestrates the full SkillRack crawl across all packs and levels."""

    def __init__(
        self,
        session: SkillRackSession,
        packs: Optional[List[int]] = None,
        levels: Optional[List[int]] = None,
        delay: float = 0.15,
    ):
        self.session = session
        self.packs = packs if packs is not None else list(PACKS.keys())
        self.levels = levels if levels is not None else CODETRACK_LEVELS
        self.delay = delay
        self.progress = ScrapeProgress()
        self._seen_questions: Set[str] = set()

    async def crawl_all(self) -> ScrapeResult:
        """Crawl all configured packs and levels."""
        logger.info(f"Starting crawl: packs={self.packs}, levels={self.levels}")

        all_questions_raw: List[QuestionRaw] = []
        packs_scanned: List[str] = []
        levels_scanned: List[int] = []

        # Crawl CODETUTOR packs (pack index 0-6)
        for pack_idx in self.packs:
            if pack_idx not in PACKS:
                logger.warning(f"Invalid pack index: {pack_idx}")
                continue

            pack_name = PACKS[pack_idx]
            try:
                questions = await self._crawl_pack(pack_idx, pack_name, None)
                all_questions_raw.extend(questions)
                packs_scanned.append(pack_name)
                self.progress.packs_done += 1
            except Exception as e:
                error_msg = f"Pack {pack_name} (idx={pack_idx}) failed: {e}"
                logger.error(error_msg)
                self.progress.errors.append(error_msg)

        # Crawl CODETRACK levels
        for level in self.levels:
            try:
                questions = await self._crawl_level(level)
                all_questions_raw.extend(questions)
                levels_scanned.append(level)
                self.progress.levels_done += 1
            except Exception as e:
                error_msg = f"CODETRACK level {level} failed: {e}"
                logger.error(error_msg)
                self.progress.errors.append(error_msg)

        # Deduplicate by question_id
        unique_questions_raw = self._deduplicate_questions_raw(all_questions_raw)

        # Convert to final Question model (without extra fields)
        final_questions = [
            Question(
                level=q.level,
                language=q.language_mapped if q.language_mapped else q.language,
                section=q.section,
                problem_set=q.problem_set,
                question=q.question,
                link=q.link,
            )
            for q in unique_questions_raw
        ]

        duration = time.time() - self.progress.start_time
        logger.info(
            f"Crawl complete: {len(final_questions)} unique questions "
            f"in {duration:.1f}s ({len(self.progress.errors)} errors)"
        )

        return ScrapeResult(
            questions=final_questions,
            total_found=len(final_questions),
            scrape_timestamp=datetime.now(timezone.utc),
            packs_scanned=packs_scanned,
            levels_scanned=levels_scanned,
            errors=self.progress.errors,
            duration_seconds=duration,
        )

    def _deduplicate_questions(self, questions: List[Question]) -> List[Question]:
        """Remove duplicate questions based on question_id."""
        seen: Set[str] = set()
        unique: List[Question] = []
        for q in questions:
            # Question model doesn't have question_id, so we extract from link
            import re
            match = re.search(r'Id-(\d+)', q.question)
            qid = match.group(1) if match else None
            if qid and qid not in seen:
                seen.add(qid)
                unique.append(q)
            elif not qid:
                unique.append(q)
        return unique

    def _deduplicate_questions_raw(self, questions: List[QuestionRaw]) -> List[QuestionRaw]:
        """Remove duplicate questions based on question_id."""
        seen: Set[str] = set()
        unique: List[QuestionRaw] = []
        for q in questions:
            if q.question_id and q.question_id not in seen:
                seen.add(q.question_id)
                unique.append(q)
            elif not q.question_id:
                unique.append(q)
        return unique

    async def _crawl_pack(self, pack_idx: int, pack_name: str, level: Optional[int]) -> List[QuestionRaw]:
        """Crawl a single CODETUTOR pack."""
        logger.info(f"Crawling pack: {pack_name} (idx={pack_idx})")

        base_url = CODETUTOR_BASE if level is None else CODETRACK_BASE_TEMPLATE.format(level=level)
        questions: List[QuestionRaw] = []

        # Step 1: Warm session / get root page
        try:
            root_html = await self.session.fetch_page(base_url)
            if is_session_expired(root_html):
                raise RuntimeError("Session expired on root page")
        except Exception as e:
            logger.error(f"Failed to fetch root page for {pack_name}: {e}")
            raise

        # Step 2: POST pack button to open pack
        pack_vs = extract_viewstate(root_html, FORM_IDS["pack_list"])
        if not pack_vs:
            raise RuntimeError(f"Could not extract ViewState for pack {pack_name}")

        pack_html = await self.session.post_form(
            base_url,
            {
                f"{FORM_IDS['pack_list']}_SUBMIT": "1",
                f"{FORM_IDS['pack_list']}:cttbl:{pack_idx}:j_id_41":
                    f"{FORM_IDS['pack_list']}:cttbl:{pack_idx}:j_id_41",
                "jakarta.faces.ViewState": pack_vs,
            },
            referer=base_url,
        )

        if is_session_expired(pack_html):
            raise RuntimeError(f"Session expired opening pack {pack_name}")

        # Step 3: Extract sub-challenges
        sub_challenges = extract_sub_challenges(pack_html)
        logger.info(f"Pack {pack_name}: found {len(sub_challenges)} sub-challenges")

        # Step 4: Iterate sub-challenges
        for sub in sub_challenges:
            try:
                sub_questions = await self._crawl_sub_challenge(
                    base_url, pack_name, pack_idx, sub, level
                )
                questions.extend(sub_questions)
                self.progress.total_questions += len(sub_questions)
            except Exception as e:
                error_msg = f"Sub-challenge '{sub['name']}' in {pack_name}: {e}"
                logger.error(error_msg)
                self.progress.errors.append(error_msg)
                continue

            # Rate limit between sub-challenges
            await asyncio.sleep(self.delay)

        return questions

    async def _crawl_level(self, level: int) -> List[Question]:
        """Crawl a CODETRACK level (level 2-6 or 100 for Prime).

        CODETRACK uses a different URL (codeprogramgroup.xhtml?gt=CODETRACK&lev=N).
        Each level page lists its own sub-challenges — we iterate packs 0-6 at
        that level URL so we pick up all languages available at that difficulty tier.
        """
        level_name = "Prime" if level == 100 else f"Level {level}"
        logger.info(f"Crawling CODETRACK {level_name}")

        all_questions: List[Question] = []
        base_url = CODETRACK_BASE_TEMPLATE.format(level=level)

        for pack_idx in list(PACKS.keys()):
            pack_name = PACKS[pack_idx]
            try:
                questions = await self._crawl_pack(pack_idx, pack_name, level)
                all_questions.extend(questions)
                logger.info(f"  CODETRACK {level_name} pack {pack_name}: {len(questions)} questions")
            except Exception as e:
                error_msg = f"CODETRACK {level_name} pack {pack_name}: {e}"
                logger.warning(error_msg)
                self.progress.errors.append(error_msg)
            # Brief pause between packs at same level
            await asyncio.sleep(self.delay)

        return all_questions

    async def _crawl_sub_challenge(
        self,
        base_url: str,
        pack_name: str,
        pack_idx: int,
        sub: Dict[str, Any],
        level: Optional[int],
    ) -> List[QuestionRaw]:
        """Crawl a single sub-challenge, returning all its questions (raw format)."""
        questions: List[QuestionRaw] = []
        sub_name = sub["name"]
        sidx = sub["sidx"]

        logger.debug(f"  Sub-challenge: {sub_name} (sidx={sidx})")

        # Fresh sub-challenge page: replay root -> pack -> sub
        # (ViewStates are single-use in JSF)
        def get_fresh_sub_page():
            # This inner function ensures we replay the chain fresh each time
            return self._replay_to_sub(base_url, pack_idx, sidx, level)

        try:
            sub_html = await get_fresh_sub_page()
        except Exception as e:
            logger.warning(f"  Sub-challenge {sub_name} expired/failed: {e}")
            raise RuntimeError(f"Sub-challenge {sub_name} failed: {e}")

        if is_session_expired(sub_html):
            raise RuntimeError(f"Sub-challenge {sub_name} page expired")

        # Extract part cards
        parts = extract_part_cards(sub_html)
        logger.debug(f"    Parts: {len(parts)}")

        if not parts:
            logger.debug(f"    No parts found in {sub_name}")
            return questions

        # Filter: only process incomplete parts (skip completed ones)
        incomplete_parts = [p for p in parts if not p.get("completed", False)]
        completed_count = len(parts) - len(incomplete_parts)
        if completed_count > 0:
            logger.info(f"    Skipping {completed_count} completed parts, processing {len(incomplete_parts)} incomplete parts")

        # Extract metadata from sub-challenge page (breadcrumb)
        metadata = extract_question_metadata(sub_html)
        language = metadata.get("language", pack_name)
        section = metadata.get("section", sub_name)
        problem_set = metadata.get("problem_set", sub_name)

        # Iterate parts (only incomplete)
        for part in incomplete_parts:
            try:
                part_questions = await self._crawl_part(
                    base_url, pack_idx, sidx, part, level,
                    language, section, problem_set
                )
                questions.extend(part_questions)
            except Exception as e:
                error_msg = f"Part '{part['name']}' in {sub_name}: {e}"
                logger.error(error_msg)
                self.progress.errors.append(error_msg)
                continue

            await asyncio.sleep(self.delay)

        return questions

    async def _replay_to_sub(
        self,
        base_url: str,
        pack_idx: int,
        sidx: int,
        level: Optional[int]
    ) -> str:
        """Replay the full chain: root -> pack -> sub-challenge.

        This is needed because JSF ViewStates are single-use per form submission.
        """
        # 1. Get fresh root
        root_html = await self.session.fetch_page(base_url)
        if is_session_expired(root_html):
            raise RuntimeError("Root page expired")

        # 2. POST pack
        pack_vs = extract_viewstate(root_html, FORM_IDS["pack_list"])
        if not pack_vs:
            raise RuntimeError("No ViewState on root for pack POST")

        pack_html = await self.session.post_form(
            base_url,
            {
                f"{FORM_IDS['pack_list']}_SUBMIT": "1",
                f"{FORM_IDS['pack_list']}:cttbl:{pack_idx}:j_id_41":
                    f"{FORM_IDS['pack_list']}:cttbl:{pack_idx}:j_id_41",
                "jakarta.faces.ViewState": pack_vs,
            },
            referer=base_url,
        )

        if is_session_expired(pack_html):
            raise RuntimeError("Pack page expired")

        # 3. POST sub-challenge
        sub_vs = extract_viewstate(pack_html, FORM_IDS["pack_list"])
        if not sub_vs:
            raise RuntimeError("No ViewState on pack for sub POST")

        sub_html = await self.session.post_form(
            base_url,
            {
                f"{FORM_IDS['pack_list']}_SUBMIT": "1",
                f"{FORM_IDS['pack_list']}:j_id_49:{sidx}:j_id_4h":
                    f"{FORM_IDS['pack_list']}:j_id_49:{sidx}:j_id_4h",
                "jakarta.faces.ViewState": sub_vs,
            },
            referer=base_url,
        )

        return sub_html

    async def _crawl_part(
        self,
        base_url: str,
        pack_idx: int,
        sidx: int,
        part: Dict[str, Any],
        level: Optional[int],
        language: str,
        section: str,
        problem_set: str,
    ) -> List[QuestionRaw]:
        """Crawl a single part, extracting all problem cards. Returns raw internal format."""
        questions: List[QuestionRaw] = []
        part_name = part["name"]
        part_row = part["row"]

        logger.debug(f"    Part: {part_name} (row={part_row})")

        # Get fresh sub page, then click part
        sub_html = await self._replay_to_sub(base_url, pack_idx, sidx, level)

        # POST part click (uses codetracks form)
        part_vs = extract_viewstate(sub_html, FORM_IDS["code_tracks"])
        if not part_vs:
            logger.warning(f"      No ViewState for part click, trying pack_list form")
            part_vs = extract_viewstate(sub_html, FORM_IDS["pack_list"])
        if not part_vs:
            raise RuntimeError(f"No ViewState for part {part_name}")

        part_html = await self.session.post_form(
            CODENV_URL,
            {
                f"{FORM_IDS['code_tracks']}_SUBMIT": "1",
                f"cttbl:{part_row}:j_id_4u": f"cttbl:{part_row}:j_id_4u",
                "jakarta.faces.ViewState": part_vs,
            },
            referer=base_url,
        )

        if is_session_expired(part_html):
            raise RuntimeError(f"Part page expired")

        # Extract problems from part page
        problems = extract_problems(part_html)
        logger.debug(f"      Problems: {len(problems)}")

        # Build QuestionRaw objects
        language_mapped = LANGUAGE_MAP.get(language, language)
        full_problem_set = build_problem_set_name(language, section, part_name)

        for prob in problems:
            qid = prob["id"]
            prob_name = prob["name"]
            prob_row = prob["row"]
            link = prob["link"]

            # Skip if already seen
            if qid in self._seen_questions:
                continue
            self._seen_questions.add(qid)

            full_question_title = build_question_title(
                language, section, part_name, prob_name, qid
            )

            # Extract level from part page metadata
            part_metadata = extract_question_metadata(part_html)
            prob_level = part_metadata.get("level", "UNKNOWN")

            question = QuestionRaw(
                level=prob_level,
                language=language,
                language_mapped=language_mapped,
                section=section,
                problem_set=full_problem_set,
                question=full_question_title,
                link=link,
                question_id=qid,
                row=prob_row,
                part=part_name,
            )
            questions.append(question)

        return questions


async def run_scrape(
    packs: Optional[List[int]] = None,
    levels: Optional[List[int]] = None,
    cookie_file: Optional[str] = None,
    delay: float = 0.15,
) -> ScrapeResult:
    """Convenience function to run a full scrape."""
    async with SkillRackSession(cookie_file=cookie_file) as session:
        scraper = SkillRackScraper(session, packs=packs, levels=levels, delay=delay)
        return await scraper.crawl_all()