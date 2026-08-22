"""Integration tests for SkillRack scraper.

Importers/callers:
- pytest test runner
- CI/CD pipeline for automated testing

Affected API:
- SkillRackScraper class methods
- run_scrape() convenience function

Data schemas:
- Question, ScrapeResult (from models.py)
- Uses mock session to avoid network calls

User instruction: "Integration tests for scraper"
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from skillrack_scraper.scraper import SkillRackScraper, run_scrape
from skillrack_scraper.session import SkillRackSession
from skillrack_scraper.models import Question, ScrapeResult
from skillrack_scraper.config import PACKS, CODETRACK_LEVELS, FORM_IDS


class TestSkillRackScraper:
    """Test the SkillRackScraper orchestration."""

    @pytest.fixture
    def mock_session(self):
        """Create a mock SkillRackSession."""
        session = AsyncMock(spec=SkillRackSession)
        session.fetch_page = AsyncMock()
        session.post_form = AsyncMock()
        session.close = AsyncMock()
        return session

    @pytest.fixture
    def scraper(self, mock_session):
        """Create a scraper with mocked session."""
        return SkillRackScraper(mock_session, packs=[0], levels=[2], delay=0.01)

    @pytest.mark.asyncio
    async def test_crawl_all_structure(self, scraper, mock_session):
        """Test that crawl_all returns proper ScrapeResult structure."""
        # Mock the chain of responses
        mock_session.fetch_page.return_value = "<html>root page</html>"
        mock_session.post_form.side_effect = [
            "<html>pack page</html>",   # pack open
            "<html>sub page</html>",    # sub-challenge click
            "<html>part page</html>",   # part click
        ]

        result = await scraper.crawl_all()

        assert isinstance(result, ScrapeResult)
        assert isinstance(result.questions, list)
        assert isinstance(result.packs_scanned, list)
        assert isinstance(result.levels_scanned, list)
        assert isinstance(result.errors, list)
        assert result.scrape_timestamp is not None
        assert result.duration_seconds is not None

    @pytest.mark.asyncio
    async def test_deduplicate_questions(self, scraper):
        """Test question deduplication by question_id."""
        q1 = Question(
            level="EASY",
            language="C++",
            section="C++ Primer",
            problem_set="C++ Programming C++ Primer C++ - S001",
            question="C++ Programming C++ Primer PART001 - Test (Id-1001)",
            link="https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1001",
            question_id="1001",
        )
        q2 = Question(
            level="EASY",
            language="C++",
            section="C++ Primer",
            problem_set="C++ Programming C++ Primer C++ - S001",
            question="C++ Programming C++ Primer PART002 - Test (Id-1001)",
            link="https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1001",
            question_id="1001",
        )
        q3 = Question(
            level="EASY",
            language="Python",
            section="Python Basics",
            problem_set="Python Programming Python Basics Python - P001",
            question="Python Programming Python Basics PART001 - Test (Id-1002)",
            link="https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1002",
            question_id="1002",
        )

        unique = scraper._deduplicate_questions([q1, q2, q3])
        assert len(unique) == 2
        assert unique[0].question_id == "1001"
        assert unique[1].question_id == "1002"

    @pytest.mark.asyncio
    async def test_deduplicate_questions_no_id(self, scraper):
        """Test deduplication keeps questions without ID."""
        q1 = Question(
            level="EASY",
            language="C++",
            section="C++ Primer",
            problem_set="C++ Programming C++ Primer C++ - S001",
            question="C++ Test (Id-1001)",
            link="https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1001",
            question_id=None,
        )
        q2 = Question(
            level="EASY",
            language="Python",
            section="Python Basics",
            problem_set="Python Programming Python Basics Python - P001",
            question="Python Test (Id-1002)",
            link="https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1002",
            question_id=None,
        )

        unique = scraper._deduplicate_questions([q1, q2])
        assert len(unique) == 2

    @pytest.mark.asyncio
    async def test_replay_to_sub_chain(self, scraper, mock_session):
        """Test the JSF ViewState replay chain: root -> pack -> sub."""
        # Need long enough HTML to pass is_session_expired check (>1000 chars)
        root_html = '<html>' + 'x' * 1500 + '<input name="jakarta.faces.ViewState" value="root_vs" /></html>'
        pack_html = '<html>' + 'x' * 1500 + '<input name="jakarta.faces.ViewState" value="pack_vs" /></html>'
        sub_html = '<html>' + 'x' * 1500 + '<div class="ui header black">Test Sub</div><button id="pkglistform:j_id_49:0:j_id_4h">Show</button></html>'

        mock_session.fetch_page.return_value = root_html
        mock_session.post_form.side_effect = [
            pack_html,  # pack response
            sub_html,   # sub response
        ]

        result = await scraper._replay_to_sub("https://test.com", 0, 0, None)

        assert "Test Sub" in result
        assert mock_session.fetch_page.call_count == 1
        assert mock_session.post_form.call_count == 2

    @pytest.mark.asyncio
    async def test_crawl_pack_session_expired(self, scraper, mock_session):
        """Test crawl_pack raises on session expiry."""
        mock_session.fetch_page.return_value = "Session Expired"

        with pytest.raises(RuntimeError, match="Session expired"):
            await scraper._crawl_pack(0, "C", None)

    @pytest.mark.asyncio
    async def test_crawl_pack_no_viewstate(self, scraper, mock_session):
        """Test crawl_pack raises when ViewState not found."""
        # Need long enough HTML to pass is_session_expired check
        mock_session.fetch_page.return_value = "<html>" + "x" * 1500 + "</html>"

        with pytest.raises(RuntimeError, match="Could not extract ViewState"):
            await scraper._crawl_pack(0, "C", None)


class TestRunScrape:
    """Test the run_scrape convenience function."""

    @pytest.mark.asyncio
    async def test_run_scrape_creates_session(self):
        """Test run_scrape creates and closes session properly."""
        with patch("skillrack_scraper.scraper.SkillRackSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=None)
            mock_session_class.return_value = mock_session

            mock_scraper = AsyncMock()
            mock_scraper.crawl_all = AsyncMock(return_value=ScrapeResult(
                questions=[],
                total_found=0,
                scrape_timestamp=datetime.now(timezone.utc),
                packs_scanned=[],
                levels_scanned=[],
                errors=[],
                duration_seconds=1.0,
            ))

            with patch("skillrack_scraper.scraper.SkillRackScraper", return_value=mock_scraper):
                result = await run_scrape(packs=[0], levels=[2])

            assert isinstance(result, ScrapeResult)
            mock_session.__aenter__.assert_called_once()
            mock_session.__aexit__.assert_called_once()


class TestScraperConfiguration:
    """Test scraper configuration options."""

    def test_default_packs_and_levels(self):
        """Test default packs and levels include all."""
        with patch("skillrack_scraper.scraper.SkillRackSession"):
            scraper = SkillRackScraper(MagicMock())
            assert set(scraper.packs) == set(PACKS.keys())
            assert scraper.levels == CODETRACK_LEVELS

    def test_custom_packs_and_levels(self):
        """Test custom packs and levels are respected."""
        with patch("skillrack_scraper.scraper.SkillRackSession"):
            scraper = SkillRackScraper(MagicMock(), packs=[0, 3], levels=[2, 100])
            assert scraper.packs == [0, 3]
            assert scraper.levels == [2, 100]

    def test_custom_delay(self):
        """Test custom delay is used."""
        with patch("skillrack_scraper.scraper.SkillRackSession"):
            scraper = SkillRackScraper(MagicMock(), delay=0.5)
            assert scraper.delay == 0.5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])