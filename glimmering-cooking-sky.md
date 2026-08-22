# Plan: Add FastAPI-Backed Incomplete Questions Panel to Killcode.js

## Context
The existing Killcode.js userscript has:
- An "Incomplete Questions" module (`IncompleteQuestionsModule`) that scrapes SkillRack directly using JSFaces ViewState — brittle and slow
- A separate "Find Incomplete" dropdown (`FindIncompleteModule`) with Track mode, Language Packs mode, and Bridge API mode
- Auto-solver logic (`startAutoSolverQueue`, `navigateToNextProblem`) that navigates to problem URLs and runs AI solving

The new Python FastAPI scraper (`skillrack_scraper/`) provides a robust local API at `http://127.0.0.1:8000` with:
- `GET /questions` — returns questions with schema: `level`, `language`, `section`, `problem_set`, `question`, `link`
- Filtering via `?language=` and `?level=` query params
- `POST /scrape/sync` — triggers fresh scrape synchronously

**Goal**: Add a new UI panel that fetches from the FastAPI server, displays incomplete questions, and wires clicks into the existing auto-solve/navigation flow — replacing the fragile direct-scraping approach.

---

## Implementation Plan

### 1. Add `@grant GM_xmlhttpRequest` and `@connect 127.0.0.1` to Userscript Header
- The header already has `@grant GM_xmlhttpRequest` (line 11) and `@connect 127.0.0.1` (line 14)
- **No changes needed** — already present

### 2. Create New Module: `FastAPIQuestionsPanel`
Add a new IIFE module (similar to `IncompleteQuestionsModule`) inside `mainCode()` that:
- Creates a floating button (📡 "API Questions") and a panel
- Fetches from `GET http://127.0.0.1:8000/questions` using the existing `gmFetch` wrapper
- Renders results in a styled list matching Killcode.js aesthetics (VT323 font, dark theme, red accents)
- Provides client-side filter inputs for language and level
- Optional "Refresh from API" button that calls `POST /scrape/sync`
- Clicking a question → calls `navigateToProblem(question)` which integrates with auto-solver

**File to modify**: `D:\KillCode\Project-KillCode.js` (inside `mainCode()` function, after existing modules)

### 3. Integration with Existing Auto-Solver/Navigation
The key integration point is `navigateToNextProblem()` (line 11321) and `startAutoSolverQueue()` (line 11247).

**Approach**: Add a new function `navigateToAPIQuestion(question)` that:
- Accepts a question object from the API (`{ problemId, problemName, link, ... }`)
- Sets up a single-item auto-solver queue
- Calls `navigateToNextProblem()` to navigate to the problem page
- The existing AutoSolver will run on page load (since `SETTINGS.enableAutoSolver` will be enabled)

Alternatively, for manual (non-auto-solve) navigation: just call `window.location.href = question.link` but the requirement says "must trigger Killcode.js's existing auto-solve/navigation logic."

**Recommended**: Reuse `startAutoSolverQueue` pattern but for a single question:
```javascript
function navigateToAPIQuestion(question) {
  autoSolverQueue = [{
    problemId: question.question_id || extractIdFromLink(question.link),
    problemName: question.question,
    // ... other fields
  }];
  autoSolverCurrentIndex = 0;
  enableAutoSolverSettings();
  navigateToNextProblem();
}
```

### 4. Panel UI Structure
```
┌─────────────────────────────────────┐
│ 📡 API Questions          [✕]       │  ← Header (gradient)
│ Last fetch: 2 min ago               │
├─────────────────────────────────────┤
│ [Language ▼] [Level ▼] [Refresh ↻]  │  ← Filter bar
├─────────────────────────────────────┤
│ ▼ STARTER  (3)                      │  ← Collapsible level sections
│   🐍 Python  │ PRIMER-01  │ Q1...   │  ← Question row
│   ➕ C++     │ PRIMER-01  │ Q2...   │
│ ▼ EASY  (1)                         │
│   🅲 C       │ CHALLENGES  │ Q3...  │
├─────────────────────────────────────┤
│ [Server unreachable — check API]    │  ← Error state (inline)
└─────────────────────────────────────┘
```

### 5. Error Handling
- **Server unreachable**: Show inline message "⚠️ Cannot reach FastAPI server at 127.0.0.1:8000. Is the scraper running?" in panel body
- **Empty results**: Show "✅ No incomplete questions found" state (matching existing pattern)
- **Malformed response**: Log error, show "❌ Invalid response from API"

### 6. Styling Consistency
- Use VT323 monospace font (already loaded in main script)
- Dark theme: `#0f0f0f` background, `#e4e4e7` text, `#ef4444` accent
- Glassmorphism: `backdrop-filter: blur(20px)`, semi-transparent borders
- Animations: `bypassSlideIn`, `bypassFadeIn` keyframes already defined
- Button style: gradient `#ef4444` → `#dc2626`, hover scale transform

---

## Critical Files to Modify
- **`D:\KillCode\Project-KillCode.js`** — Add new `FastAPIQuestionsPanel` module inside `mainCode()`, register init in the script initialization section

---

## Reusable Existing Code
| Function/Object | Location | Purpose |
|-----------------|----------|---------|
| `gmFetch(url, options)` | Line 74-115 | Wrapper for `GM_xmlhttpRequest` via message bridge |
| `navigateToNextProblem()` | Line 11321 | Navigation logic using ViewState traversal |
| `startAutoSolverQueue()` | Line 11247 | Sets up queue and enables auto-solver |
| `enableAutoSolverSettings()` | Line 11232 | Enables `SETTINGS.enableAutoSolver` and `enableAISolver` |
| `saveSettings()` / `SETTINGS` | Line 656-664 | Settings persistence |
| `showStatus()` / `hideStatus()` | Line 9032/9107 | Status toast notifications |
| `storage` object | ~Line 9600 | localStorage/sessionStorage abstraction |

---

## Verification Steps
1. **Start FastAPI server**: `cd skillrack_scraper && python -m skillrack_scraper.api`
2. **Run scrape**: `curl -X POST http://127.0.0.1:8000/scrape/sync -H "Content-Type: application/json" -d '{}'`
3. **Load SkillRack page** with Tampermonkey script installed
4. **Click new "📡 API Questions" button** → panel opens
5. **Verify**: Questions load and display with correct fields
6. **Filter**: Language/level filters work (client-side after single fetch)
7. **Click a question**: Navigates to problem page, AutoSolver activates
8. **Error states**: Stop API server → panel shows "Server unreachable" message
9. **No regressions**: Existing "Incomplete Questions" button and Find Incomplete dropdown still work

---

## Acceptance Criteria Checklist
- [ ] New panel renders in Killcode.js and fetches from `GET /questions` via `GM_xmlhttpRequest`
- [ ] Clicking a question invokes existing auto-solve/navigation logic (`navigateToNextProblem`)
- [ ] Panel handles server-unreachable and empty-list states gracefully
- [ ] No existing Killcode.js functionality is broken or duplicated
- [ ] `@grant GM_xmlhttpRequest` and `@connect 127.0.0.1` present in header (already there)
- [ ] Filtering by language and level works (client-side after single fetch)
- [ ] Optional "Refresh" button calls `POST /scrape/sync`
- [ ] Styling matches existing Killcode.js conventions (VT323, dark theme, red accents)