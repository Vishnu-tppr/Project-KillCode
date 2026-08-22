"""Unit tests for HTML parser functions."""

import pytest
from skillrack_scraper.parser import (
    extract_viewstate,
    extract_sub_challenges,
    extract_part_cards,
    extract_problems,
    extract_question_metadata,
    build_problem_set_name,
    build_question_title,
    is_session_expired,
)


class TestExtractViewState:
    def test_extract_viewstate_basic(self):
        html = '<input type="hidden" name="jakarta.faces.ViewState" id="j_id1:jakarta.faces.ViewState:0" value="abc123" />'
        assert extract_viewstate(html) == "abc123"

    def test_extract_viewstate_form_scoped(self):
        html = '''
        <form id="pkglistform">
            <input name="jakarta.faces.ViewState" value="form_specific" />
        </form>
        <form id="other">
            <input name="jakarta.faces.ViewState" value="other_form" />
        </form>
        '''
        assert extract_viewstate(html) in ("form_specific", "other_form")
        assert extract_viewstate(html, "pkglistform") == "form_specific"

    def test_extract_viewstate_none(self):
        assert extract_viewstate("") is None
        assert extract_viewstate("no viewstate here") is None


class TestExtractSubChallenges:
    def test_extract_sub_challenges_basic(self):
        html = '''
        <div class="ui header black">Python - STARTER</div>
        <button id="pkglistform:j_id_49:0:j_id_4h">Show</button>
        <div class="ui header black">PYTHON3.x - 50 EASY CHALLENGES</div>
        <button id="pkglistform:j_id_49:1:j_id_4h">Show</button>
        '''
        result = extract_sub_challenges(html)
        assert len(result) == 2
        assert result[0]["sidx"] == 0
        assert "STARTER" in result[0]["name"]
        assert result[1]["sidx"] == 1
        assert "EASY" in result[1]["name"]

    def test_extract_sub_challenges_empty(self):
        assert extract_sub_challenges("") == []


class TestExtractPartCards:
    def test_extract_part_cards_basic(self):
        # New HTML structure: cards with outputpanel (cttbl:N:j_id_4s)
        html = '''
        <div id="cttbl:0:j_id_4s" class="ui-card">
            <div class="ui-card-content">
                <b>C - STARTER - PART001</b>
            </div>
        </div>
        <div id="cttbl:1:j_id_4s" class="ui-card">
            <div class="ui-card-content">
                <b>C - STARTER - PART002</b>
            </div>
        </div>
        '''
        result = extract_part_cards(html)
        assert len(result) == 2
        assert result[0]["row"] == 0
        assert "PART001" in result[0]["name"]
        assert result[1]["row"] == 1
        assert "PART002" in result[1]["name"]

    def test_extract_part_cards_empty(self):
        assert extract_part_cards("") == []


class TestExtractProblems:
    def test_extract_problems_basic(self):
        # New HTML structure: cards with id="pctbl:N:j_id_5p"
        html = '''
        <div id="pctbl:0:j_id_5p" class="ui-card">
            <div class="ui-card-content">
                <b>Problem One (Id-1001)</b>
            </div>
        </div>
        <div id="pctbl:1:j_id_5p" class="ui-card">
            <div class="ui-card-content">
                <b>Problem Two (Id-1002)</b>
            </div>
        </div>
        '''
        result = extract_problems(html)
        assert len(result) == 2
        assert result[0]["id"] == "1001"
        assert result[0]["name"] == "Problem One"
        assert result[0]["row"] == 0
        assert result[0]["link"] == "https://skillrack.com/faces/candidate/codeprogram.xhtml?id=1001"
        assert result[1]["id"] == "1002"
        assert result[1]["name"] == "Problem Two"
        assert result[1]["row"] == 1

    def test_extract_problems_empty(self):
        assert extract_problems("") == []

    def test_extract_problems_malformed(self):
        # Card without name/ID pattern
        html = '<div id="pctbl:0:j_id_5p" class="ui-card"><div class="ui-card-content"><b>Problem (Id-999)</b></div></div>'
        result = extract_problems(html)
        assert len(result) == 1  # This should actually work now
        assert result[0]["id"] == "999"


class TestExtractQuestionMetadata:
    def test_extract_metadata_breadcrumbs(self):
        # New HTML structure: breadcrumb inside nav.ui-breadcrumb
        html = '''
        <nav class="ui-breadcrumb ui-module">
            <ol class="ui-breadcrumb-items">
                <li><a><span class="ui-menuitem-text">Home</span></a></li>
                <li><a><span class="ui-menuitem-text">C++ Programming</span></a></li>
                <li><a><span class="ui-menuitem-text">C++ Primer</span></a></li>
                <li><span class="ui-menuitem-text">C++ Programming C++ Primer C++ - S001</span></li>
            </ol>
        </nav>
        '''
        result = extract_question_metadata(html)
        assert result["language"] == "C++"
        assert result["section"] == "C++ Primer"
        assert result["problem_set"] == "C++ Programming C++ Primer C++ - S001"

    def test_extract_metadata_breadcrumbs_c(self):
        # C language breadcrumb
        html = '''
        <nav class="ui-breadcrumb ui-module">
            <ol class="ui-breadcrumb-items">
                <li><a><span class="ui-menuitem-text">Home</span></a></li>
                <li><a><span class="ui-menuitem-text">C Programming</span></a></li>
                <li><a><span class="ui-menuitem-text">C - Logical Operators, Switch and Nested If Else Practice Programs</span></a></li>
            </ol>
        </nav>
        '''
        result = extract_question_metadata(html)
        assert result["language"] == "C"
        assert result["section"] == "Logical Operators, Switch and Nested If Else"

    def test_extract_metadata_level_detection(self):
        html = 'PYTHON3.x - 50 EASY CHALLENGES'
        result = extract_question_metadata(html)
        assert result["level"] == "EASY"

        html = 'STARTER challenges available'
        result = extract_question_metadata(html)
        assert result["level"] == "STARTER"


class TestBuilders:
    def test_build_problem_set_name(self):
        result = build_problem_set_name("C++", "C++ Primer", "S001")
        assert result == "C++ Programming C++ Primer C++ - S001"

    def test_build_question_title(self):
        result = build_question_title("C++", "C++ Primer", "CW004", "Swap Unit Digits", "11374")
        assert result == "C++ Programming C++ Primer CW004 - Swap Unit Digits (Id-11374)"


class TestIsSessionExpired:
    def test_expired_short_content(self):
        assert is_session_expired("short") is True
        assert is_session_expired("") is True

    def test_expired_indicators(self):
        assert is_session_expired("j_security_check") is True
        assert is_session_expired("Session Expired") is True
        assert is_session_expired("Please login to continue") is True

    def test_not_expired(self):
        html = "x" * 2000
        assert is_session_expired(html) is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])