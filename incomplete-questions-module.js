// ============================================
// INCOMPLETE QUESTIONS FINDER MODULE  v2
// ============================================
// Improvements over v1:
//  • Per-language filtering (C / Java / Python / C++ / SQL / DS-C / DS-Java)
//  • Live progress bar with ETA
//  • Direct "Solve →" clickable links (open in same tab)
//  • Search box to filter by name / ID
//  • Scan only selected languages (faster!)
//  • Cache persists across panel open/close
// ============================================

const IncompleteQuestionsModule = (function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────────
    const LANGUAGE_PACKS = {
        0: { name: 'C',       icon: '🅲',  alias: 'c'       },
        1: { name: 'Java',    icon: '☕',  alias: 'java'    },
        2: { name: 'Python',  icon: '🐍',  alias: 'python'  },
        3: { name: 'C++',     icon: '➕',  alias: 'cpp'     },
        4: { name: 'SQL',     icon: '🗄️',  alias: 'sql'     },
        5: { name: 'DS-C',    icon: '📊',  alias: 'dsc'     },
        6: { name: 'DS-Java', icon: '📈',  alias: 'dsjava'  },
    };

    const BASE_URL   = 'https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR';
    const CODENV_URL = 'https://skillrack.com/faces/candidate/codeprogram.xhtml';

    // ── State ──────────────────────────────────────────────────────────
    let isScanning          = false;
    let incompleteQuestions = {};
    let lastScanTimestamp   = null;
    let uiPanel             = null;
    let uiButton            = null;
    let scanStartTime       = null;
    let totalSteps          = 0;
    let completedSteps      = 0;

    // ── Request Queue ──────────────────────────────────────────────────
    let queuePromise = Promise.resolve();
    function enqueueRequest(fn) {
        const next = queuePromise.then(() => fn(), () => fn());
        queuePromise = next.catch(() => {});
        return next;
    }

    // ── GM_xmlhttpRequest Bridge ───────────────────────────────────────
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substr(2, 9);
            const timer = setTimeout(() => {
                window.removeEventListener('message', handle);
                reject(new Error('Request timeout (30s)'));
            }, 30000);

            const handle = (event) => {
                if (!event.data || event.data.type !== 'GM_XHR_RESPONSE' || event.data.id !== id) return;
                clearTimeout(timer);
                window.removeEventListener('message', handle);
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve({
                        ok:          event.data.status >= 200 && event.data.status < 300,
                        status:      event.data.status,
                        responseText: event.data.responseText,
                    });
                }
            };

            window.addEventListener('message', handle);
            window.postMessage({
                type: 'GM_XHR_REQUEST',
                id,
                options: {
                    method:  options.method || 'GET',
                    url,
                    headers: options.headers || {},
                    data:    options.body || options.data,
                },
            }, '*');
        });
    }

    // ── HTML Helpers ───────────────────────────────────────────────────
    function extractViewState(html, formId = null) {
        if (!html) return null;
        let src = html;
        if (formId) {
            const pos = html.indexOf(`id="${formId}"`);
            if (pos !== -1) src = html.substring(pos);
        }
        const m = src.match(/name="jakarta\.faces\.ViewState"[^>]*value="([^"]*)"/);
        return m ? m[1] : null;
    }

    // ── Scraping Helpers ───────────────────────────────────────────────
    async function openPack(packIndex) {
        const html = await gmFetch(BASE_URL);
        const vs   = extractViewState(html.responseText, 'pkglistform');
        if (!vs) throw new Error('Could not extract ViewState from base page');
        const body = new URLSearchParams({
            'pkglistform_SUBMIT': '1',
            [`pkglistform:cttbl:${packIndex}:j_id_41`]: `pkglistform:cttbl:${packIndex}:j_id_41`,
            'jakarta.faces.ViewState': vs,
        }).toString();
        const r = await gmFetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: body,
        });
        if (!r.responseText || r.responseText.length < 5000 || r.responseText.includes('Expired')) {
            throw new Error('Pack open failed — session may be expired');
        }
        return r.responseText;
    }

    function extractSubChallenges(html) {
        const out = [];
        const re  = /id="pkglistform:j_id_49:(\d+):j_id_4h"/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const seg  = html.substring(Math.max(0, m.index - 1200), m.index);
            const nm   = seg.match(/<div class="ui header black">([^<]+)<\/div>/g);
            const name = nm ? nm[nm.length - 1].replace(/<[^>]+>/g, '').trim() : '?';
            out.push({ sidx: parseInt(m[1]), name });
        }
        return out.sort((a, b) => a.sidx - b.sidx);
    }

    async function clickSubChallenge(packHtml, sidx) {
        const vs = extractViewState(packHtml, 'pkglistform');
        const body = new URLSearchParams({
            'pkglistform_SUBMIT': '1',
            [`pkglistform:j_id_49:${sidx}:j_id_4h`]: `pkglistform:j_id_49:${sidx}:j_id_4h`,
            'jakarta.faces.ViewState': vs,
        }).toString();
        const r = await gmFetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: body,
        });
        return r.responseText;
    }

    function extractPartCards(html) {
        const cards = [];
        const re    = /<button id="cttbl:(\d+):j_id_4u"/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const seg  = html.substring(Math.max(0, m.index - 1800), m.index);
            const nm   = seg.match(/<b>([^<]+)<\/b>/g);
            const name = nm ? nm[nm.length - 1].replace(/<[^>]+>/g, '').trim() : '?';
            cards.push({ row: parseInt(m[1]), name });
        }
        return cards.sort((a, b) => a.row - b.row);
    }

    async function clickPart(subHtml, row) {
        const vs = extractViewState(subHtml, 'codetracks');
        const body = new URLSearchParams({
            'codetracks_SUBMIT': '1',
            [`cttbl:${row}:j_id_4u`]: `cttbl:${row}:j_id_4u`,
            'jakarta.faces.ViewState': vs,
        }).toString();
        const r = await gmFetch(CODENV_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: body,
        });
        return r.responseText;
    }

    function extractIncompleteProblems(html) {
        const problems = [];
        const re       = /<b>([^<]*?)\s*\(Id-(\d+)\)/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const name = m[1].trim();
            const id   = m[2];
            const seg  = html.substring(m.index, m.index + 1200);
            const rowM = seg.match(/id="pctbl:(\d+):j_id_5w"/);
            if (!rowM) continue;
            problems.push({
                row:  parseInt(rowM[1]),
                id,
                name,
                link: `${CODENV_URL}?id=${id}`,
            });
        }
        return problems.sort((a, b) => a.row - b.row);
    }

    // ── Main Scan ──────────────────────────────────────────────────────
    async function scanPack(packIndex) {
        const packInfo = LANGUAGE_PACKS[packIndex];
        setStatusText(`Opening ${packInfo.name} pack…`);

        let packHtml;
        try {
            packHtml = await openPack(packIndex);
        } catch (e) {
            setStatusText(`❌ ${packInfo.name}: ${e.message}`);
            return {};
        }

        const subs = extractSubChallenges(packHtml);
        totalSteps += subs.length;
        updateProgressBar();

        const results = {};

        for (const sub of subs) {
            setStatusText(`${packInfo.icon} ${packInfo.name} › ${sub.name.substring(0, 35)}…`);

            try {
                const subHtml = await clickSubChallenge(packHtml, sub.sidx);
                const parts   = extractPartCards(subHtml);

                results[sub.name] = {};

                for (const part of parts) {
                    try {
                        // Refresh pack HTML each time (ViewState is single-use)
                        packHtml = await openPack(packIndex);
                        const freshSub  = await clickSubChallenge(packHtml, sub.sidx);
                        const partHtml  = await clickPart(freshSub, part.row);
                        const problems  = extractIncompleteProblems(partHtml);
                        if (problems.length > 0) {
                            results[sub.name][part.name] = problems;
                        }
                    } catch (e) {
                        console.warn(`[KillCode] Part "${part.name}" failed:`, e);
                    }
                    await sleep(180);
                }

            } catch (e) {
                console.warn(`[KillCode] Sub "${sub.name}" failed:`, e);
            }

            completedSteps++;
            updateProgressBar();
            packHtml = await openPack(packIndex); // refresh for next sub
        }

        return results;
    }

    async function scanAllPacks(selectedIndices = null) {
        if (isScanning) { alert('Scan already in progress!'); return; }

        const indices = selectedIndices || Object.keys(LANGUAGE_PACKS).map(Number);
        isScanning       = true;
        incompleteQuestions = {};
        scanStartTime    = Date.now();
        totalSteps       = 0;
        completedSteps   = 0;

        showLoadingUI(indices);

        try {
            for (const idx of indices) {
                try {
                    const results = await scanPack(idx);
                    const packName = LANGUAGE_PACKS[idx].name;
                    const hasAny   = Object.values(results).some(
                        sub => Object.keys(sub).length > 0
                    );
                    if (hasAny) incompleteQuestions[packName] = results;
                } catch (e) {
                    console.error(`[KillCode] Pack ${idx} error:`, e);
                    await sleep(1000);
                }
            }
            lastScanTimestamp = Date.now();
            renderResults();
        } catch (e) {
            setStatusText(`❌ Fatal: ${e.message}`);
        } finally {
            isScanning = false;
        }
    }

    // ── UI ─────────────────────────────────────────────────────────────
    function createButton() {
        if (uiButton) return;
        uiButton = document.createElement('button');
        uiButton.id        = 'kc-incomplete-btn';
        uiButton.innerHTML = '🔍 Incomplete';
        Object.assign(uiButton.style, {
            position:     'fixed',
            bottom:       '20px',
            right:        '20px',
            padding:      '11px 18px',
            background:   'linear-gradient(135deg,#667eea,#764ba2)',
            color:        '#fff',
            border:       'none',
            borderRadius: '10px',
            fontSize:     '14px',
            fontWeight:   '700',
            cursor:       'pointer',
            boxShadow:    '0 4px 18px rgba(102,126,234,0.5)',
            zIndex:       '10000',
            transition:   'transform 0.2s, box-shadow 0.2s',
            fontFamily:   'system-ui,sans-serif',
        });
        uiButton.onmouseenter = () => {
            uiButton.style.transform  = 'translateY(-2px)';
            uiButton.style.boxShadow  = '0 8px 24px rgba(102,126,234,0.7)';
        };
        uiButton.onmouseleave = () => {
            uiButton.style.transform  = '';
            uiButton.style.boxShadow  = '0 4px 18px rgba(102,126,234,0.5)';
        };
        uiButton.addEventListener('click', togglePanel);
        document.body.appendChild(uiButton);
    }

    function createPanel() {
        if (uiPanel) return;
        uiPanel = document.createElement('div');
        uiPanel.id = 'kc-panel';
        uiPanel.style.cssText = `
            position:fixed; top:50%; right:20px; transform:translateY(-50%);
            width:500px; max-height:82vh; background:#0d1117; border-radius:14px;
            box-shadow:0 16px 48px rgba(0,0,0,0.6); z-index:10001;
            display:none; overflow:hidden; flex-direction:column;
            font-family:system-ui,sans-serif; color:#c9d1d9; border:1px solid #30363d;
        `;

        // ── Language selector chips
        const langChips = Object.entries(LANGUAGE_PACKS).map(([idx, p]) =>
            `<label class="kc-chip" data-idx="${idx}" title="${p.name}">
                <input type="checkbox" value="${idx}" checked style="display:none">
                <span>${p.icon} ${p.name}</span>
             </label>`
        ).join('');

        uiPanel.innerHTML = `
        <div id="kc-header" style="padding:16px 20px; background:linear-gradient(135deg,#667eea,#764ba2); flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:16px; font-weight:700; color:#fff;">🔍 Incomplete Questions</span>
                <button id="kc-close" style="background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;">✕</button>
            </div>
            <div id="kc-meta" style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;"></div>
        </div>

        <div style="padding:12px 16px; background:#161b22; border-bottom:1px solid #30363d; flex-shrink:0;">
            <div style="font-size:11px; color:#8b949e; margin-bottom:8px; text-transform:uppercase; letter-spacing:.06em;">Languages to scan</div>
            <div id="kc-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">${langChips}</div>
            <div style="display:flex; gap:8px;">
                <button id="kc-scan-btn" style="flex:1; padding:9px; background:#667eea; color:#fff; border:none; border-radius:7px; cursor:pointer; font-weight:700; font-size:13px;">⚡ Scan Now</button>
                <button id="kc-all-btn"  style="padding:9px 13px; background:#21262d; color:#8b949e; border:1px solid #30363d; border-radius:7px; cursor:pointer; font-size:12px;">All</button>
                <button id="kc-none-btn" style="padding:9px 13px; background:#21262d; color:#8b949e; border:1px solid #30363d; border-radius:7px; cursor:pointer; font-size:12px;">None</button>
            </div>
        </div>

        <div style="padding:10px 16px; background:#0d1117; border-bottom:1px solid #21262d; flex-shrink:0; display:none;" id="kc-search-bar">
            <input id="kc-search" type="text" placeholder="🔎  Search by name or ID…"
                style="width:100%; padding:8px 12px; background:#161b22; border:1px solid #30363d;
                       border-radius:7px; color:#c9d1d9; font-size:13px; outline:none; box-sizing:border-box;">
        </div>

        <div id="kc-body" style="flex:1; overflow-y:auto; padding:16px; min-height:0;">
            <div id="kc-status" style="text-align:center; padding:40px 20px; color:#8b949e;">
                Choose languages above and click <strong style="color:#667eea">Scan Now</strong>
            </div>
            <div id="kc-results" style="display:none;"></div>
        </div>

        <style>
            .kc-chip span {
                display:inline-block; padding:4px 10px; border-radius:20px;
                font-size:12px; font-weight:600; cursor:pointer;
                background:#21262d; border:1px solid #30363d; color:#8b949e;
                user-select:none; transition:all .15s;
            }
            .kc-chip input:checked + span {
                background:rgba(102,126,234,.25); border-color:#667eea; color:#c9d1d9;
            }
            .kc-chip span:hover { border-color:#667eea; }
            #kc-progress-wrap { margin:12px 0; }
            #kc-progress-bar  {
                height:6px; background:#21262d; border-radius:3px; overflow:hidden;
            }
            #kc-progress-fill {
                height:100%; width:0%; background:linear-gradient(90deg,#667eea,#f093fb);
                border-radius:3px; transition:width .3s ease;
            }
            .kc-problem-row {
                display:flex; align-items:center; justify-content:space-between;
                padding:9px 12px; background:#161b22; border:1px solid #21262d;
                border-radius:7px; margin-bottom:6px; transition:border-color .15s;
            }
            .kc-problem-row:hover { border-color:#667eea; }
            .kc-solve-btn {
                padding:4px 12px; background:linear-gradient(135deg,#667eea,#764ba2);
                color:#fff; text-decoration:none; border-radius:5px; font-size:12px;
                font-weight:700; white-space:nowrap; flex-shrink:0; margin-left:8px;
            }
            .kc-solve-btn:hover { opacity:.85; }
            #kc-body::-webkit-scrollbar { width:5px; }
            #kc-body::-webkit-scrollbar-track { background:#0d1117; }
            #kc-body::-webkit-scrollbar-thumb { background:#30363d; border-radius:3px; }
        </style>
        `;

        document.body.appendChild(uiPanel);

        // Wire up events
        document.getElementById('kc-close').onclick = () => { uiPanel.style.display = 'none'; };
        document.getElementById('kc-scan-btn').onclick = startScan;
        document.getElementById('kc-all-btn').onclick  = () => setAllChips(true);
        document.getElementById('kc-none-btn').onclick = () => setAllChips(false);
        document.getElementById('kc-search')?.addEventListener('input', filterResults);
    }

    function setAllChips(checked) {
        uiPanel.querySelectorAll('.kc-chip input').forEach(cb => { cb.checked = checked; });
    }

    function getSelectedIndices() {
        return [...uiPanel.querySelectorAll('.kc-chip input:checked')].map(cb => Number(cb.value));
    }

    function startScan() {
        const indices = getSelectedIndices();
        if (!indices.length) { alert('Select at least one language to scan!'); return; }
        scanAllPacks(indices);
    }

    function togglePanel() {
        if (!uiPanel) createPanel();
        const isHidden = uiPanel.style.display === 'none' || uiPanel.style.display === '';
        uiPanel.style.display    = isHidden ? 'flex' : 'none';
        uiPanel.style.flexDirection = 'column';
        updateMeta();
    }

    function updateMeta() {
        const el = document.getElementById('kc-meta');
        if (!el) return;
        if (lastScanTimestamp) {
            const mins = Math.floor((Date.now() - lastScanTimestamp) / 60000);
            el.textContent = mins < 1 ? 'Last scan: just now' : `Last scan: ${mins} min ago`;
        } else {
            el.textContent = 'Not scanned yet';
        }
    }

    // ── Loading UI ──────────────────────────────────────────────────────
    function showLoadingUI(indices) {
        const names   = indices.map(i => LANGUAGE_PACKS[i].icon + ' ' + LANGUAGE_PACKS[i].name).join('  ');
        const statusEl = document.getElementById('kc-status');
        const resultsEl = document.getElementById('kc-results');
        if (!statusEl) return;
        statusEl.style.display  = 'block';
        resultsEl.style.display = 'none';
        document.getElementById('kc-search-bar').style.display = 'none';

        statusEl.innerHTML = `
            <div style="margin-bottom:16px; font-size:13px; color:#8b949e;">Scanning: ${names}</div>
            <div id="kc-status-text" style="font-size:13px; margin-bottom:12px; color:#c9d1d9; min-height:1.4em;"></div>
            <div id="kc-progress-wrap">
                <div id="kc-progress-bar"><div id="kc-progress-fill"></div></div>
                <div id="kc-progress-label" style="font-size:11px; color:#8b949e; margin-top:5px; text-align:right;"></div>
            </div>`;
    }

    function setStatusText(msg) {
        const el = document.getElementById('kc-status-text');
        if (el) el.textContent = msg;
    }

    function updateProgressBar() {
        const fill  = document.getElementById('kc-progress-fill');
        const label = document.getElementById('kc-progress-label');
        if (!fill || totalSteps === 0) return;
        const pct = Math.min(100, Math.round((completedSteps / totalSteps) * 100));
        fill.style.width = pct + '%';
        if (label) {
            const elapsed = (Date.now() - scanStartTime) / 1000;
            const eta     = completedSteps > 0
                ? ((elapsed / completedSteps) * (totalSteps - completedSteps)).toFixed(0)
                : '—';
            label.textContent = `${completedSteps}/${totalSteps}  ETA ${eta}s`;
        }
    }

    // ── Render Results ──────────────────────────────────────────────────
    function renderResults() {
        const statusEl  = document.getElementById('kc-status');
        const resultsEl = document.getElementById('kc-results');
        const searchBar = document.getElementById('kc-search-bar');
        if (!statusEl || !resultsEl) return;

        statusEl.style.display = 'none';
        resultsEl.style.display = 'block';

        let totalIncomplete = 0;
        for (const pd of Object.values(incompleteQuestions))
            for (const sd of Object.values(pd))
                for (const pl of Object.values(sd))
                    totalIncomplete += pl.length;

        updateMeta();

        if (totalIncomplete === 0) {
            searchBar.style.display = 'none';
            resultsEl.innerHTML = `
                <div style="text-align:center; padding:48px 20px;">
                    <div style="font-size:48px; margin-bottom:12px;">✅</div>
                    <div style="font-size:16px; font-weight:700; color:#3fb950;">All Complete!</div>
                    <div style="color:#8b949e; margin-top:6px; font-size:13px;">No incomplete questions found.</div>
                </div>`;
            return;
        }

        // Show search bar
        searchBar.style.display = 'block';

        let html = `<div style="margin-bottom:14px; padding:10px 14px; background:#161b22;
                         border:1px solid #30363d; border-radius:8px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:22px; color:#f85149; font-weight:700;">${totalIncomplete}</span>
            <span style="color:#8b949e; font-size:13px;">incomplete question${totalIncomplete !== 1 ? 's' : ''} found</span>
        </div>`;

        for (const [packName, packData] of Object.entries(incompleteQuestions)) {
            const packInfo = Object.values(LANGUAGE_PACKS).find(p => p.name === packName);
            const icon     = packInfo?.icon || '📝';

            let packTotal = 0;
            for (const sd of Object.values(packData))
                for (const pl of Object.values(sd))
                    packTotal += pl.length;

            html += `<div class="kc-pack-section" data-pack="${packName}" style="margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #21262d;">
                    <span style="font-size:18px;">${icon}</span>
                    <span style="font-weight:700; font-size:15px; color:#e6edf3;">${packName}</span>
                    <span style="margin-left:auto; font-size:12px; color:#f85149; font-weight:700;">${packTotal} incomplete</span>
                </div>`;

            for (const [subName, parts] of Object.entries(packData)) {
                const subProbs = Object.values(parts).flat();
                if (!subProbs.length) continue;

                html += `<details style="margin-bottom:10px;" open>
                    <summary style="cursor:pointer; padding:7px 10px; background:#161b22;
                        border:1px solid #30363d; border-radius:7px; font-size:13px;
                        color:#8b949e; list-style:none; display:flex; align-items:center; gap:6px;">
                        <span style="color:#c9d1d9; font-weight:600;">${subName}</span>
                        <span style="margin-left:auto; background:#f85149; color:#fff;
                            padding:1px 8px; border-radius:10px; font-size:11px; font-weight:700;">${subProbs.length}</span>
                    </summary>
                    <div style="padding:8px 4px 0 4px;">`;

                for (const [partName, problems] of Object.entries(parts)) {
                    if (!problems.length) continue;
                    html += `<div style="margin-bottom:8px;">
                        <div style="font-size:11px; color:#6e7681; margin:0 0 5px 2px; text-transform:uppercase; letter-spacing:.05em;">${partName}</div>`;
                    for (const p of problems) {
                        html += `<div class="kc-problem-row" data-name="${p.name.toLowerCase()}" data-id="${p.id}">
                            <div>
                                <div style="font-size:13px; font-weight:600; color:#e6edf3;">${p.name}</div>
                                <div style="font-size:11px; color:#6e7681; margin-top:2px;">ID: ${p.id}</div>
                            </div>
                            <a href="${p.link}" class="kc-solve-btn" target="_blank">Solve →</a>
                        </div>`;
                    }
                    html += `</div>`;
                }

                html += `</div></details>`;
            }

            html += `</div>`;
        }

        resultsEl.innerHTML = html;

        // Re-wire search
        const searchInput = document.getElementById('kc-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.addEventListener('input', filterResults);
        }
    }

    function filterResults() {
        const q = (document.getElementById('kc-search')?.value || '').toLowerCase();
        document.querySelectorAll('.kc-problem-row').forEach(row => {
            const match = !q || row.dataset.name?.includes(q) || row.dataset.id?.includes(q);
            row.style.display = match ? '' : 'none';
        });
    }

    // ── Utilities ───────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Public API ──────────────────────────────────────────────────────
    function init() {
        if (!window.location.hostname.includes('skillrack.com')) return;
        createButton();
        createPanel();
    }

    return {
        init,
        scan:              scanAllPacks,
        getResults:        () => incompleteQuestions,
        getCacheTimestamp: () => lastScanTimestamp,
        isScanning:        () => isScanning,
    };
})();

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(IncompleteQuestionsModule.init, 800));
} else {
    setTimeout(IncompleteQuestionsModule.init, 800);
}