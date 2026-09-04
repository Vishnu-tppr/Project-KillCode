"""Configuration constants for SkillRack scraper."""

from typing import Dict

# Base URLs
CODETUTOR_BASE = "https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR"
CODETRACK_BASE_TEMPLATE = "https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev={level}"
CODENV_URL = "https://skillrack.com/faces/candidate/codeprogram.xhtml"

# Pack index to name mapping (CODETUTOR)
PACKS: Dict[int, str] = {
    0: "C",
    1: "Java",
    2: "Python",
    3: "C++",
    4: "SQL",
    5: "DS-C",
    6: "DS-Java",
}

# CODETRACK levels
CODETRACK_LEVELS = [2, 3, 4, 5, 6, 100]  # 100 = Prime

# Language mapping: raw SkillRack name -> normalized name for API
LANGUAGE_MAP: Dict[str, str] = {
    "C": "C17",
    "Java": "JAVA21",
    "Python": "PYTHON311",
    "C++": "CPP23",
    "SQL": "SQL",
    "DS-C": "C17-DS",
    "DS-Java": "JAVA21-DS",
}

# HTTP settings
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
REQUEST_TIMEOUT = 30.0
DEFAULT_DELAY_SECONDS = 0.15  # Base delay between requests

# Retry settings
MAX_RETRIES = 3
BACKOFF_FACTOR = 2.0
RETRY_ON_STATUS = {429, 500, 502, 503, 504}

# Form IDs used in PrimeFaces
FORM_IDS = {
    "pack_list": "pkglistform",
    "code_tracks": "codetracks",
    "problem_form": "pcform",
}

# HTML selectors (regex patterns)
PATTERNS = {
    "viewstate": r'name="jakarta\.faces\.ViewState"[^>]*value="([^"]*)"',
    "sub_challenge_button": r'id="pkglistform:j_id_49:(\d+):j_id_4h"',
    "sub_challenge_name": r'<div class="ui header black">([^<]+)</div>',
    # Support both outputpanel cards (j_id_4s) and button cards (j_id_4u)
    "part_card": r'(?:id="cttbl:(\d+):j_id_4[a-z0-9_]+"|<button id="cttbl:(\d+):j_id_4u")',
    "part_name": r'<b>([^<]+)</b>',
    "part_completed": r'<span class="ui label green tag tag-pill">Completed</span>',
    # Support both problem cards (j_id_5p) and solve buttons (j_id_5w)
    "problem_card": r'id="pctbl:(\d+):j_id_5[a-z0-9_]+"',
    "problem_name_id": r'<b>\s*([^<]+?)\s*\(Id-(\d+)\)[^<]*</b>',
    "problem_solve_button": r'id="pctbl:(\d+):j_id_5w"',
    # Breadcrumb trail: specifically targets the ui-breadcrumb component
    "breadcrumb": r'class="ui-breadcrumb[^>]*>.*?<span class="ui-menuitem-text">([^<]+)</span>',
}

# Output settings
DEFAULT_OUTPUT_DIR = "data"