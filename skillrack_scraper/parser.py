"""HTML parsing functions for SkillRack pages."""

import re
import html
import logging
from typing import List, Dict, Optional, Any

from .config import PATTERNS, FORM_IDS

logger = logging.getLogger(__name__)


def extract_viewstate(html_content: str, form_id: Optional[str] = None) -> Optional[str]:
    """Extract ViewState from HTML, optionally scoped to a specific form.

    In PrimeFaces/JSF, each form has its own ViewState. The form-scoped ViewState
    appears AFTER the form's opening tag, not before. So we need to find the form
    and search forward from there. This matches tools/enum.py's vs_in_form() logic.
    """
    if not html_content:
        return None

    src = html_content
    if form_id:
        pos = html_content.find(f'id="{form_id}"')
        if pos != -1:
            # Search from form start to end of body (ViewState is typically near the END of the form)
            # No window limit - matches enum.py's vs_in_form() behavior
            src = html_content[pos:]

    pattern = PATTERNS["viewstate"]
    match = re.search(pattern, src)
    return match.group(1) if match else None


def extract_sub_challenges(html_content: str) -> List[Dict[str, Any]]:
    """Extract sub-challenges from pack page. Returns list of {sidx, name}."""
    results = []
    pattern = PATTERNS["sub_challenge_button"]
    name_pattern = PATTERNS["sub_challenge_name"]

    for match in re.finditer(pattern, html_content):
        sidx = int(match.group(1))
        seg_start = max(0, match.start() - 1200)
        segment = html_content[seg_start:match.start()]
        name_matches = re.findall(name_pattern, segment)
        name = name_matches[-1].strip() if name_matches else "?"
        results.append({"sidx": sidx, "name": html.unescape(name)})

    return sorted(results, key=lambda x: x["sidx"])


def extract_part_cards(html_content: str) -> List[Dict[str, Any]]:
    """Extract part cards from sub-challenge page. Returns list of {row, name, completed}.

    Supports outputpanel cards (cttbl:N:j_id_4s) and legacy buttons (cttbl:N:j_id_4u).
    Each card contains the part name in a <b> tag.
    Completed parts have a <span class="ui label green tag tag-pill">Completed</span> tag.
    """
    results = []
    pattern = PATTERNS["part_card"]
    name_pattern = PATTERNS["part_name"]

    matches = list(re.finditer(pattern, html_content))
    for i, match in enumerate(matches):
        row_str = match.group(1) or (match.group(2) if len(match.groups()) > 1 else None)
        if not row_str:
            continue
        row = int(row_str)
        seg_start = match.start()
        # End segment at next card or end of content (avoid bleeding into next card)
        seg_end = matches[i + 1].start() if i + 1 < len(matches) else len(html_content)
        segment = html_content[seg_start:seg_end]
        name_matches = re.findall(name_pattern, segment)
        name = name_matches[0].strip() if name_matches else "?"
        # Check if this part card has the "Completed" tag
        completed = "Completed" in segment
        results.append({"row": row, "name": html.unescape(name), "completed": completed})

    return sorted(results, key=lambda x: x["row"])


def extract_problems(html_content: str) -> List[Dict[str, Any]]:
    """Extract incomplete problems from part page. Returns list of {row, id, name, link}.

    Matches problem cards (pctbl:N:j_id_5p/5w) and falls back to <b>Name (Id-NNN)</b> scanning.
    """
    results = []
    card_pattern = PATTERNS["problem_card"]
    name_id_pattern = PATTERNS["problem_name_id"]

    for match in re.finditer(card_pattern, html_content):
        row = int(match.group(1))
        seg_start = match.start()
        seg_end = min(len(html_content), match.start() + 2000)
        segment = html_content[seg_start:seg_end]

        name_id_match = re.search(name_id_pattern, segment)
        if not name_id_match:
            continue

        name = name_id_match.group(1).strip()
        qid = name_id_match.group(2)

        results.append({
            "row": row,
            "id": qid,
            "name": html.unescape(name),
            "link": f"https://skillrack.com/faces/candidate/codeprogram.xhtml?id={qid}",
        })

    # Fallback to direct name (Id-NNN) scanning if card IDs drifted (from tools/find_incomplete.py)
    if not results:
        for m in re.finditer(r'<b>([^<]*?)\s*\(Id-(\d+)\)', html_content):
            nm, pid = m.group(1).strip(), m.group(2)
            seg = html_content[max(0, m.start() - 600):min(len(html_content), m.start() + 1200)]
            rowm = re.search(r'id="pctbl:(\d+):', seg)
            row_val = int(rowm.group(1)) if rowm else len(results)
            results.append({
                "row": row_val,
                "id": pid,
                "name": html.unescape(nm),
                "link": f"https://skillrack.com/faces/candidate/codeprogram.xhtml?id={pid}",
            })

    return sorted(results, key=lambda x: x["row"])


def extract_question_metadata(html_content: str) -> Dict[str, str]:
    """Extract metadata from problem list page (breadcrumb trail).

    The breadcrumb is in a nav with class="ui-breadcrumb" containing ol.ui-breadcrumb-items
    with li > a > span.ui-menuitem-text

    Expected breadcrumb:
    1. Home
    2. C Programming (or Java Programming, etc.) -> language
    3. C - Logical Operators, Switch and Nested If Else Practice Programs -> section
    """
    metadata = {
        "level": "UNKNOWN",
        "language": "UNKNOWN",
        "section": "UNKNOWN",
        "problem_set": "UNKNOWN",
    }

    # Find the breadcrumb navigation
    breadcrumb_nav_pattern = r'class="ui-breadcrumb[^>]*>.*?</nav>'
    nav_match = re.search(breadcrumb_nav_pattern, html_content, re.DOTALL)
    if nav_match:
        nav_html = nav_match.group(0)
        # Extract all span.ui-menuitem-text within the breadcrumb nav
        breadcrumb_pattern = r'<span class="ui-menuitem-text">([^<]+)</span>'
        breadcrumbs = re.findall(breadcrumb_pattern, nav_html)
        if breadcrumbs:
            if len(breadcrumbs) >= 2:
                # Language: "C Programming" -> "C"
                lang = breadcrumbs[1].strip()
                metadata["language"] = lang.replace(" Programming", "").strip()
            if len(breadcrumbs) >= 3:
                # Section: "C - Logical Operators, Switch and Nested If Else Practice Programs"
                # -> "Logical Operators, Switch and Nested If Else"
                section = breadcrumbs[2].strip()
                # Remove "X - " prefix and " Practice Programs" suffix
                if " - " in section:
                    section = section.split(" - ", 1)[1]
                section = section.replace(" Practice Programs", "").strip()
                metadata["section"] = section
            if len(breadcrumbs) >= 4:
                metadata["problem_set"] = breadcrumbs[3].strip()

    level_patterns = [
        r'(STARTER|VERY-EASY|EASY|AVERAGE|COURSE|Prime)',
        r'50\s+(VERY-EASY|EASY|AVERAGE)\s+CHALLENGES',
    ]
    for pattern in level_patterns:
        match = re.search(pattern, html_content, re.IGNORECASE)
        if match:
            metadata["level"] = match.group(1).upper().replace(" ", "-")
            break

    return metadata


def build_problem_set_name(language: str, section: str, part: str) -> str:
    """Build problem_set string from components.

    Expected format: "C++ Programming C++ Primer C++ - S001" or "Challenges Count: 10"
    For C parts: "C Programming Logical Operators, Switch and Nested If Else C - PART004"
    """
    # Extract the part suffix (PART004, PART005, etc.) from the full part name
    # Part name format: "C - Logical Operators, Switch and Nested If Else - PART004"
    part_suffix = part
    if " - " in part:
        # Get the last part after " - "
        part_suffix = part.split(" - ")[-1]

    return f"{language} Programming {section} {language} - {part_suffix}"


def build_question_title(language: str, section: str, part: str, problem_name: str, qid: str) -> str:
    """Build full question title.

    Expected format: "C++ Programming C++ Primer CW004 - MFIB - Swap Unit Digits (Id-11374)"
    For C parts: "C Programming Logical Operators, Switch and Nested If Else PART004 - Cross the River (Id-6662)"
    """
    # Extract the part suffix (PART004, PART005, etc.) from the full part name
    part_suffix = part
    if " - " in part:
        part_suffix = part.split(" - ")[-1]

    return f"{language} Programming {section} {part_suffix} - {problem_name} (Id-{qid})"


def is_session_expired(html_content: str) -> bool:
    """Check if the session has expired (login page shown)."""
    if not html_content or len(html_content) < 1000:
        return True
    expired_indicators = [
        "j_security_check",
        "Expired",
        "Session Expired",
        "login.xhtml",
        "Please login",
    ]
    return any(indicator in html_content for indicator in expired_indicators)


def parse_enum_page(html_content: str, pack_name: str) -> Dict[str, Any]:
    """Parse a complete enumeration page result."""
    subs = extract_sub_challenges(html_content)
    result = {}

    for sub in subs:
        result[sub["name"]] = {}

    return result