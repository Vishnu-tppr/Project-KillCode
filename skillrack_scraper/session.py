"""Async HTTP session management with cookie auth and retry/backoff."""

import os
import asyncio
import logging
from typing import Optional, Dict, Any
from pathlib import Path

import httpx
from httpx import AsyncClient, Response, TimeoutException

from .config import (
    DEFAULT_USER_AGENT,
    REQUEST_TIMEOUT,
    DEFAULT_DELAY_SECONDS,
    MAX_RETRIES,
    BACKOFF_FACTOR,
    RETRY_ON_STATUS,
    CODETUTOR_BASE,
    CODETRACK_BASE_TEMPLATE,
    CODENV_URL,
)

logger = logging.getLogger(__name__)


class SkillRackSession:
    """Manages authenticated HTTP session for SkillRack scraping."""

    def __init__(
        self,
        cookie_file: Optional[str] = None,
        cookie_env_var: str = "SKILLRACK_COOKIE",
        base_delay: float = DEFAULT_DELAY_SECONDS,
    ):
        self.cookie_file = cookie_file or str(Path(__file__).parent.parent / "tools" / "cookie.txt")
        self.cookie_env_var = cookie_env_var
        self.base_delay = base_delay
        self._client: Optional[AsyncClient] = None
        self._cookie_value: Optional[str] = None
        self._last_request_time: float = 0.0

    def _load_cookie(self) -> str:
        """Load cookie from file or environment variable."""
        # Priority 1: Environment variable
        env_cookie = os.environ.get(self.cookie_env_var, "").strip()
        if env_cookie:
            logger.debug("Loaded cookie from environment variable")
            return env_cookie

        # Priority 2: Cookie file
        cookie_path = Path(self.cookie_file)
        if cookie_path.exists():
            cookie = cookie_path.read_text().strip()
            if cookie:
                logger.debug(f"Loaded cookie from {cookie_path}")
                return cookie

        raise RuntimeError(
            f"No cookie found. Set ${self.cookie_env_var} or put cookie in {self.cookie_file}. "
            "Format: JSESSIONID=...; oam.Flash.RENDERMAP.TOKEN=..."
        )

    @property
    def cookie(self) -> str:
        """Get cookie value (lazy load)."""
        if self._cookie_value is None:
            self._cookie_value = self._load_cookie()
        return self._cookie_value

    @property
    def client(self) -> AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = AsyncClient(
                headers={
                    "User-Agent": DEFAULT_USER_AGENT,
                    "Cookie": self.cookie,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                },
                timeout=httpx.Timeout(REQUEST_TIMEOUT),
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "SkillRackSession":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _get_base_url(self, level: Optional[int] = None) -> str:
        """Get base URL for given level (None = CODETUTOR)."""
        if level is None:
            return CODETUTOR_BASE
        return CODETRACK_BASE_TEMPLATE.format(level=level)

    async def _rate_limit(self):
        """Enforce minimum delay between requests."""
        import time
        elapsed = time.time() - self._last_request_time
        if elapsed < self.base_delay:
            await asyncio.sleep(self.base_delay - elapsed)
        self._last_request_time = time.time()

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        data: Optional[Dict[str, Any]] = None,
        referer: Optional[str] = None,
        **kwargs,
    ) -> Response:
        """Make HTTP request with exponential backoff retry."""
        headers = kwargs.pop("headers", {})
        if referer:
            headers["Referer"] = referer

        last_exception = None

        for attempt in range(MAX_RETRIES + 1):
            await self._rate_limit()

            try:
                response = await self.client.request(
                    method=method,
                    url=url,
                    data=data,
                    headers=headers,
                    **kwargs,
                )

                # Check if we should retry
                if response.status_code in RETRY_ON_STATUS and attempt < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** attempt
                    logger.warning(
                        f"Got status {response.status_code}, retrying in {wait_time}s "
                        f"(attempt {attempt + 1}/{MAX_RETRIES})"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                response.raise_for_status()
                return response

            except TimeoutException as e:
                last_exception = e
                if attempt < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** attempt
                    logger.warning(f"Timeout, retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    await asyncio.sleep(wait_time)
                    continue
                raise

            except httpx.HTTPStatusError as e:
                if e.response.status_code in RETRY_ON_STATUS and attempt < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** attempt
                    logger.warning(
                        f"HTTP {e.response.status_code}, retrying in {wait_time}s "
                        f"(attempt {attempt + 1}/{MAX_RETRIES})"
                    )
                    await asyncio.sleep(wait_time)
                    continue
                raise

            except Exception as e:
                last_exception = e
                if attempt < MAX_RETRIES:
                    wait_time = BACKOFF_FACTOR ** attempt
                    logger.warning(f"Request failed: {e}, retrying in {wait_time}s")
                    await asyncio.sleep(wait_time)
                    continue
                raise

        raise last_exception or RuntimeError("Max retries exceeded")

    async def get(self, url: str, referer: Optional[str] = None, **kwargs) -> Response:
        """GET request with retry."""
        return await self._request_with_retry("GET", url, referer=referer, **kwargs)

    async def post(
        self,
        url: str,
        data: Dict[str, Any],
        referer: Optional[str] = None,
        **kwargs,
    ) -> Response:
        """POST request with retry (form-encoded)."""
        headers = kwargs.pop("headers", {})
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
        return await self._request_with_retry(
            "POST", url, data=data, referer=referer, headers=headers, **kwargs
        )

    async def fetch_page(self, url: str, referer: Optional[str] = None) -> str:
        """Fetch page content as text."""
        response = await self.get(url, referer=referer)
        return response.text

    async def post_form(
        self,
        url: str,
        form_data: Dict[str, str],
        referer: Optional[str] = None,
    ) -> str:
        """POST form data and return response text."""
        response = await self.post(url, data=form_data, referer=referer)
        return response.text