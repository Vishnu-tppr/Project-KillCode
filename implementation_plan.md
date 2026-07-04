# Implementation Plan: Add "Find Incomplete" Feature to SkillRack Userscript

## Overview
Add a **"Find Incomplete"** button to the existing SkillRack toolbar that scans the `viewsolved.xhtml` page, identifies parts where `solved_count < total`, and navigates to the first incomplete section. When auto-solver is enabled, it also triggers the existing `AutoSolver.solve()` flow. The feature follows the existing IIFE module pattern and slots cleanly into the `onScriptEnabled` lifecycle.

---

## Key Discoveries from Codebase Analysis

### viewsolved.xhtml table structure (from skillrack_context.md)
```html
<table id="solcnt:tbl">
  <thead>
    <tr>
      <th>Title</th>
      <th>Programs Count</th>   <!-- This is solved count shown as circular label -->
      <th>Check Pending Programs</th>
    </tr>
  </thead>
  <tbody id="solcnt:tbl_data">
    <tr data-ri="N">
      <td>C - EASY - PART004</td>
      <td><span class="ui label black circular">1</span></td>
      <td><input type="submit" value="Check" class="ui button blue"/></td>
    </tr>
  </tbody>
</table>
```
- The "Programs Count" column shows **solved count** (not total)
- "Check" button navigates to the part's question list page
- The page is fetched via a POST form with `solcnt:j_id_3k_input = "tr"` (for Programming Tracks)

### viewsolved.xhtml fetch approach
The viewsolved page is a PrimeFaces JSF page. The table only shows **solved** parts (parts with at least 1 solved). Parts with 0 solved won't appear. We use `fetch` with the correct form body to retrieve the page.

### Toolbar injection target
```
div.ui-toolbar-group-right > div.ui-menu.ui-menubar > ul.ui-menu-list
```
Inject a new `<li>` matching existing sibling pattern:
```html
<li class="ui-menuitem ui-widget ui-corner-all" role="none">
  <a class="ui-menuitem-link ui-corner-all" href="#" id="find-incomplete-btn">
    <span class="ui-menuitem-icon ui-icon pi pi-fw pi-search ui-menuitem-icon-left"></span>
    <span class="ui-menuitem-text">Find Incomplete</span>
  </a>
</li>
```

### Settings already partially added
`DEFAULT_SETTINGS` already has `enableFindIncomplete: true` at lines 507-509. ✅ No change needed there.

---

## User Review Required

> [!IMPORTANT]
> The `viewsolved.xhtml` page **only shows parts that have been started** (≥1 solved). Parts with 0 solves are absent from the table. The "Check" button navigates to the part's question page where total count can be read. The plan handles this: we use the "Check" button's form submit as the navigation target.

> [!WARNING]
> The `viewsolved.xhtml` page is fetched via PrimeFaces POST. The userscript must replicate the POST body including the hidden `jakarta.faces.ViewState` token — this is session-specific and must be fetched fresh from the live page each time, not hardcoded.

> [!NOTE]
> The bit-masking approach requested in the spec is not meaningfully applicable here since the scan is a **one-shot async traversal** (not a graph BFS over DOM nodes). Instead, we implement a Priority Queue (min-heap) on completion ratio to satisfy the "lowest ratio first" ordering, with an `AbortController` per fetch for timeout/cancellation. This is functionally equivalent and correct.

---

## Open Questions

1. **Expected total per part**: When a part is not in the viewsolved table (0 solves), we cannot know the total without fetching the "Check" page. Should we skip 0-solve parts entirely (navigating only to parts with partial completion) or also detect never-started parts?  
   → **Recommendation**: Include never-started parts by navigating to the "Check" link from the section list page. These get ratio = 0/? = lowest priority.

2. **Level 1 scope**: Level 1 (`lev1.xhtml`) only has Tutorials, Daily Challenge, Daily Test. The viewsolved data for Level 1 tutorial parts appears in the same `viewsolved.xhtml` table. Should Level 1 be scanned at all?  
   → **Recommendation**: Yes, via the viewsolved table. Just skip DC/DT rows (titles containing "Daily").

---

## Architecture

```
FindIncompleteModule (IIFE)
├── State machine: IDLE → SCANNING → NAVIGATING → SOLVING → COMPLETE | ERROR
├── fetchViewSolvedData()      — fetch + parse viewsolved table (Tracks)
├── buildPriorityQueue()       — min-heap sorted by solved/knownTotal ratio
├── findFirstIncomplete()      — dequeue until row with solved < 10 (or known total)
├── navigateToSection(checkBtn)— click the "Check" submit for that row
├── injectMenuButton()         — add <li> to .ui-menu-list in toolbar
├── showStatusPanel()          — floating overlay during scan
└── onComplete()               — trigger AutoSolver.solve() if enabled
```

---

## Proposed Changes

### Single File — [MODIFY] [Anti-Cheat Bypass 5.0.user.js](file:///d:/Skillrack-Script/Anti-Cheat%20Bypass%205.0.user.js)

---

#### Change 1 — Settings (lines 507-509) — Already Done ✅
`enableFindIncomplete: true` is already present. No change needed.

---

#### Change 2 — FindIncompleteModule IIFE (insert before `onScriptEnabled` at line 7607)

New IIFE module (~350 lines) implementing:

```javascript
const FindIncompleteModule = (function () {
    'use strict';

    // ── State Machine ────────────────────────────────────────────────────────
    const STATE = { IDLE: 'IDLE', SCANNING: 'SCANNING', NAVIGATING: 'NAVIGATING',
                    SOLVING: 'SOLVING', COMPLETE: 'COMPLETE', ERROR: 'ERROR' };
    let currentState = STATE.IDLE;

    // ── Mutex / navigation lock ──────────────────────────────────────────────
    let navigationLock = false;
    let activeController = null;

    // ── UI elements ──────────────────────────────────────────────────────────
    let statusPanel = null;
    let menuBtn = null;

    // ── Priority Queue (min-heap on completion ratio) ─────────────────────────
    //    Each entry: { title, solvedCount, checkBtnSelector, ratio }
    class MinHeap {
        constructor() { this._data = []; }
        push(item) { /* sift-up */ }
        pop()      { /* sift-down */ }
        get size() { return this._data.length; }
    }

    // ── Fetch viewsolved table ────────────────────────────────────────────────
    async function fetchViewSolvedData(signal) {
        // 1. GET the page to grab ViewState token
        // 2. POST with solcnt:j_id_3k_input=tr to get the "Programming Tracks" table
        // 3. Parse tbody#solcnt\:tbl_data rows
        // 4. Return array of { title, solvedCount, checkRowIndex }
    }

    // ── Build priority queue ───────────────────────────────────────────────────
    function buildPriorityQueue(rows) {
        const heap = new MinHeap();
        // Typical part sizes: STARTER=55/25/20, INTRO=30/20/15, 
        //                     EASY/AVERAGE/ARRAY/STRING/LOOPS = 10
        // Use heuristic: if solved < 10, ratio = solved/10; else unknown = solved/solved (=1, skip)
        for (const row of rows) {
            const knownTotal = inferTotal(row.title, row.solvedCount);
            if (row.solvedCount < knownTotal) {
                heap.push({ ...row, total: knownTotal, ratio: row.solvedCount / knownTotal });
            }
        }
        return heap;
    }

    // ── Infer expected total from part title heuristics ───────────────────────
    function inferTotal(title, solved) {
        // STARTER PART001=55, PART002=25, PART003-004=20, PART005+=20
        // INTRO PART001=30, PART002-003=20, PART004=15, PART005=30
        // Default parts = 10
        // If solved > 10, it's likely a larger part; use solved as floor (skip these)
    }

    // ── Main scan ─────────────────────────────────────────────────────────────
    async function scan() {
        if (navigationLock || currentState !== STATE.IDLE) return;
        navigationLock = true;
        setState(STATE.SCANNING);
        showStatus('Scanning...', '🔍');

        activeController = new AbortController();
        const signal = activeController.signal;

        try {
            // Timeout: 10s per fetch attempt, 3 retries
            const rows = await withTimeout(fetchViewSolvedData, 10000, 3, signal);
            const heap = buildPriorityQueue(rows);

            if (heap.size === 0) {
                setState(STATE.COMPLETE);
                showStatus('All questions completed! 🎉', '✅');
                setTimeout(hideStatus, 5000);
                return;
            }

            const target = heap.pop();
            showStatus(`Found: ${target.title}`, '🎯');
            setState(STATE.NAVIGATING);

            // Navigate: click the "Check" submit for that row
            await navigateToSection(target.checkRowIndex);

        } catch (err) {
            setState(STATE.ERROR);
            showStatus(`Error: ${err.message}`, '❌');
            setTimeout(hideStatus, 5000);
        } finally {
            navigationLock = false;
            activeController = null;
        }
    }

    // ── Navigate to section ───────────────────────────────────────────────────
    async function navigateToSection(rowIndex) {
        // Navigate to viewsolved.xhtml if not already there, then submit Check button
        const targetUrl = '/faces/candidate/viewsolved.xhtml';
        if (!window.location.pathname.includes('viewsolved')) {
            // Store intent in sessionStorage, navigate
            sessionStorage.setItem('findIncomplete_targetRow', rowIndex);
            window.location.href = targetUrl;
            return;
        }
        // Already on page: click Check button for rowIndex
        const checkBtn = document.querySelector(`input[name="solcnt:tbl:${rowIndex}:j_id_43"]`);
        if (checkBtn) {
            setState(STATE.SOLVING);
            checkBtn.click();
            // After navigation, if auto-solver is on, AutoSolver.init() will fire
        }
    }

    // ── UI: Menu button injection ─────────────────────────────────────────────
    function injectMenuButton() {
        const menuList = document.querySelector('.ui-toolbar-group-right .ui-menu-list');
        if (!menuList || document.getElementById('find-incomplete-btn')) return;

        const li = document.createElement('li');
        li.className = 'ui-menuitem ui-widget ui-corner-all';
        li.setAttribute('role', 'none');
        li.innerHTML = `
          <a id="find-incomplete-btn" tabindex="-1" role="menuitem"
             class="ui-menuitem-link ui-corner-all" href="#"
             style="cursor:pointer; white-space:nowrap;">
            <span class="ui-menuitem-icon ui-icon pi pi-fw pi-search ui-menuitem-icon-left"
                  aria-hidden="true"></span>
            <span class="ui-menuitem-text">Find Incomplete</span>
          </a>`;

        li.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            if (currentState === STATE.IDLE || currentState === STATE.COMPLETE ||
                currentState === STATE.ERROR) {
                setState(STATE.IDLE);
                scan();
            } else {
                // Cancel active scan
                if (activeController) activeController.abort();
                setState(STATE.IDLE);
                hideStatus();
            }
        });

        menuList.insertBefore(li, menuList.lastElementChild);
        menuBtn = li;
    }

    // ── UI: Floating status panel ─────────────────────────────────────────────
    function showStatus(msg, icon = '⏳') { /* glassmorphism panel */ }
    function hideStatus() { /* remove/hide panel */ }
    function setState(s) { currentState = s; }

    // ── Auto-resume on viewsolved page ────────────────────────────────────────
    function checkAutoResume() {
        const targetRow = sessionStorage.getItem('findIncomplete_targetRow');
        if (targetRow !== null && window.location.pathname.includes('viewsolved')) {
            sessionStorage.removeItem('findIncomplete_targetRow');
            setTimeout(() => {
                // Need table to be visible: click Show button first
                const showBtn = document.querySelector('#solcnt\\:j_id_3o');
                if (showBtn) {
                    showBtn.click();
                    setTimeout(() => navigateToSection(parseInt(targetRow)), 2000);
                }
            }, 1000);
        }
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    function init() {
        if (!SETTINGS.enableFindIncomplete) return;
        injectMenuButton();
        checkAutoResume();
    }

    return { init, scan, getState: () => currentState };
})();
```

---

#### Change 3 — Register initialization (append to existing `onScriptEnabled` block at line 7607)

```javascript
// Initialize FindIncompleteModule when DOM is ready AND script is enabled
onScriptEnabled(() => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(FindIncompleteModule.init, 800);
        });
    } else {
        setTimeout(FindIncompleteModule.init, 600);
    }
    window.FindIncompleteModule = FindIncompleteModule;
});
```

---

## Algorithm Details

### Priority Queue (Min-Heap)
- **Key**: `ratio = solved / knownTotal` (float 0..1)
- Parts with ratio `< 1` are enqueued; ratio = 0 = never started
- Time complexity: O(N log N) build, O(log N) per dequeue
- Space: O(N) for heap entries (N = number of parts ≈ 100–200)

### Total Inference Heuristic (from actual data)
| Part Title Pattern | Expected Total |
|---|---|
| `STARTER - PART001` | 55 |
| `STARTER - PART002` | 25 |
| `STARTER - PART003/004` | 20 |
| `STARTER - PART005+` | 20 |
| `INTRO - PART001/005` | 30 |
| `INTRO - PART002/003` | 20 |
| `INTRO - PART004` | 15 |
| `EASY ADDON - PART006/008` | 10 |
| `EASY ADDON - PART007/009/010` | 8–10 |
| Default (EASY/AVERAGE/Array/String/Loops) | 10 |
| Solved count > 10 already | Use solved as total (treated complete) |

### Fetch Strategy
```
1. fetch GET /faces/candidate/viewsolved.xhtml → extract jakarta.faces.ViewState
2. fetch POST /faces/candidate/viewsolved.xhtml with body:
     solcnt=solcnt
     solcnt:j_id_3k_input=tr   (Programming Tracks)
     solcnt:j_id_3o=           (Show button)
     solcnt_SUBMIT=1
     jakarta.faces.ViewState=<extracted>
3. Parse response HTML: tbody#solcnt\:tbl_data → extract rows
4. Filter out Daily Challenge/Test rows (title contains "Daily")
```

### Navigation Flow
```
User clicks "Find Incomplete"
    │
    ▼
[SCANNING] fetchViewSolvedData() 
    │  AbortController timeout=10s, retries=3
    ▼
buildPriorityQueue() → MinHeap sorted by ratio
    │
    ├─ heap empty → [COMPLETE] "All done! 🎉"
    │
    └─ target = heap.pop()  (lowest ratio)
        │
        [NAVIGATING]
        │
        ├─ if on viewsolved.xhtml → click Check[rowIndex]
        │       │
        │       └─ navigates to question list page
        │               │
        │               └─ if autoSolver enabled → AutoSolver already fires via MutationObserver
        │
        └─ if NOT on viewsolved.xhtml → sessionStorage.setItem(targetRow) → location.href
                │
                └─ page reloads → checkAutoResume() → click Show → click Check[rowIndex]
```

---

## Verification Plan

### Automated / Manual Tests

1. **Partial completion** — navigate to a part showing count `1` (e.g., "C - EASY - PART004" with count=1). Click "Find Incomplete". Verify navigation reaches that part's question list.

2. **All complete** — temporarily set all visible counts ≥ total in browser console. Click "Find Incomplete". Expect "All questions completed! 🎉" message.

3. **Network failure** — devtools → block `viewsolved.xhtml` fetch. Click button. Expect error toast after timeout (10s × 3 retries = 30s max), no infinite loop.

4. **Auto-solver ON** — enable auto-solver in settings. Click "Find Incomplete". Verify script navigates AND then calls `AutoSolver.solve()` on the question page.

5. **Auto-solver OFF** — disable auto-solver. Click "Find Incomplete". Verify script navigates only (question page opens, no auto-solve triggered).

6. **Double-click / re-click while scanning** — click again while SCANNING. Expect abort + reset to IDLE.

7. **viewsolved page open** — start on `viewsolved.xhtml`, click button. Expect no double-navigation; the "Check" button is clicked directly.

8. **Skip DC/DT** — verify no row with "Daily" in title is ever selected.

### Commands
```bash
# Lint check (userscript is a single JS file, no build step)
# Manual: load in Tampermonkey, open browser console, verify no syntax errors
# Check for console.log statements before commit
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| PrimeFaces ViewState changes per session | Always GET fresh page first to extract token |
| Table not rendered until "Show" clicked | Two-step: click Show, wait 2s, then read table |
| `enableFindIncomplete` setting already in DEFAULT_SETTINGS | ✅ Already present — no conflict |
| AutoSolver firing on wrong page after navigation | AutoSolver's existing `isOnProblemPageURL()` guard handles this |
| Stale sessionStorage key if user navigates away mid-scan | Key is cleared on every checkAutoResume() call |
| File exceeds 800-line function size rule | Module split into focused functions <50 lines each |

---

## Success Criteria
- [ ] "Find Incomplete" menu item appears in toolbar on all SkillRack pages
- [ ] Clicking scans `viewsolved.xhtml` without navigating away (background fetch)
- [ ] Status panel shows progress during scan
- [ ] First incomplete part (lowest ratio) is navigated to
- [ ] With auto-solver ON: solve flow triggers after navigation
- [ ] With auto-solver OFF: navigate only
- [ ] Daily Challenge/Test sections are skipped
- [ ] Network timeout after 10s × 3 retries, graceful error shown
- [ ] All existing anti-cheat, captcha, and AI modules unaffected
- [ ] No `console.log` debug statements in production code
- [ ] Functions ≤ 50 lines, file additions follow existing IIFE pattern
