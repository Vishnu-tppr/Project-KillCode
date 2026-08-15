// ============================================
// INCOMPLETE QUESTIONS FINDER MODULE
// ============================================
// Pure JS port of tools/enum.py + tools/sack.py
// Uses GM_xmlhttpRequest for httpOnly cookie support
// ============================================

const IncompleteQuestionsModule = (function() {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────
    const LANGUAGE_PACKS = {
        0: { name: 'C', icon: '🅲' },
        1: { name: 'Java', icon: '☕' },
        2: { name: 'Python', icon: '🐍' },
        3: { name: 'C++', icon: '➕' },
        4: { name: 'SQL', icon: '🗄️' },
        5: { name: 'DS-C', icon: '📊' },
        6: { name: 'DS-Java', icon: '📈' }
    };

    const BASE_URL = 'https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR';
    const CODENV_URL = 'https://skillrack.com/faces/candidate/codeprogram.xhtml';

    // ── State ────────────────────────────────────────────────────────
    let isScanning = false;
    let incompleteQuestions = {};
    let lastScanTimestamp = null;
    let cachedData = null;
    let uiPanel = null;
    let uiButton = null;
    let queuePromise = Promise.resolve();

    // ── Request Queue (sequential to avoid ViewState conflicts) ──────
    function enqueueRequest(fn) {
        const nextLink = queuePromise.then(
            () => fn(),
            () => fn()
        );
        queuePromise = nextLink.catch(() => {});
        return nextLink;
    }

    // ── GM_xmlhttpRequest Wrapper ────────────────────────────────────
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substr(2, 9);

            const handleMessage = (event) => {
                if (event.data && event.data.type === 'GM_XHR_RESPONSE' && event.data.id === requestId) {
                    window.removeEventListener('message', handleMessage);
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else {
                        resolve({
                            ok: event.data.status >= 200 && event.data.status < 300,
                            status: event.data.status,
                            statusText: event.data.statusText,
                            responseText: event.data.responseText,
                            responseHeaders: event.data.responseHeaders
                        });
                    }
                }
            };

            window.addEventListener('message', handleMessage);

            window.postMessage({
                type: 'GM_XHR_REQUEST',
                id: requestId,
                options: {
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers || {},
                    data: options.body || options.data
                }
            }, '*');

            // Timeout
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Request timeout'));
            }, 30000);
        });
    }

    // ── ViewState Extraction ─────────────────────────────────────────
    function extractViewState(html, formId = null) {
        if (!html) return null;

        if (formId) {
            const formPos = html.indexOf(`id="${formId}"`);
            if (formPos !== -1) {
                html = html.substring(formPos);
            }
        }

        const match = html.match(/name="jakarta\.faces\.ViewState"[^>]*value="([^"]*)"/);
        return match ? match[1] : null;
    }

    // ── Scraping Logic (Ported from enum.py) ─────────────────────────
    async function openPack(packIndex) {
        // Get base page
        let html = await gmFetch(BASE_URL);
        let viewState = extractViewState(html, 'pkglistform');

        if (!viewState) {
            throw new Error('Could not extract ViewState');
        }

        // POST pack button
        const formData = {
            'pkglistform_SUBMIT': '1',
            [`pkglistform:cttbl:${packIndex}:j_id_41`]: `pkglistform:cttbl:${packIndex}:j_id_41`,
            'jakarta.faces.ViewState': viewState
        };

        html = await gmFetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams(formData).toString()
        });

        if (html.includes('Expired') || html.length < 5000) {
            throw new Error('Failed to open pack - session may be expired');
        }

        return html;
    }

    function extractSubChallenges(html) {
        const subChallenges = [];
        const regex = /id="pkglistform:j_id_49:(\d+):j_id_4h"/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const sidx = parseInt(match[1]);
            const start = Math.max(0, match.index - 1200);
            const segment = html.substring(start, match.index);

            const nameMatch = segment.match(/<div class="ui header black">([^<]+)<\/div>/);
            const name = nameMatch ? nameMatch[1].trim() : '?';

            subChallenges.push({ sidx, name });
        }

        return subChallenges.sort((a, b) => a.sidx - b.sidx);
    }

    async function clickSubChallenge(html, sidx) {
        const viewState = extractViewState(html, 'pkglistform');

        const formData = {
            'pkglistform_SUBMIT': '1',
            [`pkglistform:j_id_49:${sidx}:j_id_4h`]: `pkglistform:j_id_49:${sidx}:j_id_4h`,
            'jakarta.faces.ViewState': viewState
        };

        return gmFetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams(formData).toString()
        });
    }

    function extractPartCards(html) {
        const parts = [];
        const regex = /<button id="cttbl:(\d+):j_id_4u"/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const row = parseInt(match[1]);
            const start = Math.max(0, match.index - 1800);
            const segment = html.substring(start, match.index);

            const nameMatch = segment.match(/<b>([^<]+)<\/b>/);
            const name = nameMatch ? nameMatch[1].trim() : '?';

            parts.push({ row, name });
        }

        return parts.sort((a, b) => a.row - b.row);
    }

    async function clickPart(html, row) {
        const viewState = extractViewState(html, 'codetracks');

        const formData = {
            'codetracks_SUBMIT': '1',
            [`cttbl:${row}:j_id_4u`]: `cttbl:${row}:j_id_4u`,
            'jakarta.faces.ViewState': viewState
        };

        return gmFetch(CODENV_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams(formData).toString()
        });
    }

    function extractIncompleteProblems(html) {
        const problems = [];
        const regex = /<b>([^<]*?)\s*\(Id-(\d+)\)/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const name = match[1].trim();
            const id = match[2];
            const segment = html.substring(match.index, match.index + 1200);

            const rowMatch = segment.match(/id="pctbl:(\d+):j_id_5w"/);
            if (!rowMatch) continue;

            const row = parseInt(rowMatch[1]);
            problems.push({ row, id, name });
        }

        return problems.sort((a, b) => a.row - b.row);
    }

    // ── Main Scanning ────────────────────────────────────────────────
    async function scanPackForIncomplete(packIndex) {
        updateStatus(`Scanning ${LANGUAGE_PACKS[packIndex].name} pack...`);

        let packHtml = await openPack(packIndex);
        const subChallenges = extractSubChallenges(packHtml);

        updateStatus(`Found ${subChallenges.length} sections in ${LANGUAGE_PACKS[packIndex].name}`);

        const results = {};

        for (let i = 0; i < subChallenges.length; i++) {
            const sub = subChallenges[i];
            updateStatus(`[${i + 1}/${subChallenges.length}] ${sub.name.substring(0, 40)}...`);

            try {
                const subHtml = await clickSubChallenge(packHtml, sub.sidx);
                const parts = extractPartCards(subHtml);

                results[sub.name] = {};

                for (const part of parts) {
                    const partHtml = await clickPart(subHtml, part.row);
                    const problems = extractIncompleteProblems(partHtml);

                    if (problems.length > 0) {
                        results[sub.name][part.name] = problems;
                    }

                    await sleep(200);
                }

            } catch (err) {
                console.error(`Error scanning ${sub.name}:`, err);
            }

            // Refresh pack HTML (ViewState expires after use)
            packHtml = await openPack(packIndex);
        }

        return results;
    }

    async function scanAllPacks() {
        if (isScanning) {
            alert('Scan already in progress!');
            return;
        }

        isScanning = true;
        incompleteQuestions = {};

        try {
            showLoadingUI();

            for (let packIndex = 0; packIndex <= 6; packIndex++) {
                const packName = LANGUAGE_PACKS[packIndex].name;

                try {
                    const results = await scanPackForIncomplete(packIndex);

                    let hasIncomplete = false;
                    for (const sub in results) {
                        if (Object.keys(results[sub]).length > 0) {
                            hasIncomplete = true;
                            break;
                        }
                    }

                    if (hasIncomplete) {
                        incompleteQuestions[packName] = results;
                    }

                } catch (err) {
                    console.error(`Failed to scan ${packName}:`, err);
                    await sleep(1000);
                }
            }

            lastScanTimestamp = Date.now();
            cachedData = { ...incompleteQuestions };
            updateStatus('✓ Scan complete!');
            renderResults();

        } catch (err) {
            updateStatus(`❌ Error: ${err.message}`);
        } finally {
            isScanning = false;
        }
    }

    // ── UI Functions ─────────────────────────────────────────────────
    function createButton() {
        if (uiButton) return;

        uiButton = document.createElement('button');
        uiButton.id = 'incomplete-questions-btn';
        uiButton.innerHTML = '🔍 Find Incomplete';
        uiButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            transition: all 0.3s ease;
        `;

        uiButton.addEventListener('click', togglePanel);
        document.body.appendChild(uiButton);
    }

    function createPanel() {
        if (uiPanel) return;

        uiPanel = document.createElement('div');
        uiPanel.style.cssText = `
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            width: 450px;
            max-height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10001;
            display: none;
            overflow: hidden;
        `;

        uiPanel.innerHTML = `
            <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;">🔍 Incomplete Questions</h3>
                    <button id="close-panel-btn" style="background: transparent; border: none; color: white; cursor: pointer; font-size: 20px;">✕</button>
                </div>
                <div id="cache-info" style="font-size: 11px; opacity: 0.8; margin-top: 5px;"></div>
            </div>
            <div id="panel-content" style="padding: 20px; max-height: calc(80vh - 140px); overflow-y: auto;">
                <div id="status-area" style="text-align: center; padding: 40px 20px; color: #666;">
                    <p>Click "Scan Now" to find your incomplete questions</p>
                </div>
                <div id="results-area" style="display: none;"></div>
            </div>
            <div style="padding: 15px 20px; border-top: 1px solid #eee; background: #f9f9f9; display: flex; gap: 10px;">
                <button id="scan-btn" style="flex: 1; padding: 10px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                    Scan Now
                </button>
                <button id="refresh-btn" style="flex: 1; padding: 10px; background: #48bb78; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                    Refresh
                </button>
            </div>
        `;

        document.body.appendChild(uiPanel);

        document.getElementById('close-panel-btn').addEventListener('click', () => {
            uiPanel.style.display = 'none';
        });

        document.getElementById('scan-btn').addEventListener('click', scanAllPacks);
        document.getElementById('refresh-btn').addEventListener('click', scanAllPacks);
    }

    function togglePanel() {
        if (!uiPanel) createPanel();
        uiPanel.style.display = uiPanel.style.display === 'none' ? 'block' : 'none';
        updateCacheInfo();
    }

    function updateCacheInfo() {
        const cacheInfo = document.getElementById('cache-info');
        if (cacheInfo) {
            if (lastScanTimestamp) {
                const minsAgo = Math.floor((Date.now() - lastScanTimestamp) / 60000);
                cacheInfo.textContent = minsAgo === 0 ? 'Just scanned' : `${minsAgo} min ago`;
            } else {
                cacheInfo.textContent = 'Not scanned yet';
            }
        }
    }

    function showLoadingUI() {
        const statusArea = document.getElementById('status-area');
        const resultsArea = document.getElementById('results-area');

        statusArea.style.display = 'block';
        resultsArea.style.display = 'none';

        statusArea.innerHTML = `
            <div style="text-align: center;">
                <div style="border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <p id="status-text">Scanning...</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
    }

    function updateStatus(message) {
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = message;
    }

    function renderResults() {
        const statusArea = document.getElementById('status-area');
        const resultsArea = document.getElementById('results-area');

        statusArea.style.display = 'none';
        resultsArea.style.display = 'block';

        let totalIncomplete = 0;
        for (const pack in incompleteQuestions) {
            for (const sub in incompleteQuestions[pack]) {
                for (const part in incompleteQuestions[pack][sub]) {
                    totalIncomplete += incompleteQuestions[pack][sub][part].length;
                }
            }
        }

        if (totalIncomplete === 0) {
            resultsArea.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">✓</div>
                    <h4 style="margin: 0 0 10px 0; color: #48bb78;">All Questions Complete!</h4>
                    <p style="color: #666; margin: 0;">No incomplete questions found.</p>
                </div>
            `;
            return;
        }

        let html = `<div style="margin-bottom: 15px; padding: 10px; background: #f0f9ff; border-radius: 6px;">
            <strong>Found ${totalIncomplete} incomplete question${totalIncomplete !== 1 ? 's' : ''}</strong>
        </div>`;

        for (const packName in incompleteQuestions) {
            const packData = incompleteQuestions[packName];
            const packInfo = LANGUAGE_PACKS[Object.keys(LANGUAGE_PACKS).find(k => LANGUAGE_PACKS[k].name === packName)];
            const icon = packInfo?.icon || '📝';

            html += `<div style="margin-bottom: 20px;"><h4 style="display: flex; align-items: center; gap: 8px; margin: 0 0 12px 0;"><span style="font-size: 18px;">${icon}</span> ${packName}</h4>`;

            for (const subName in packData) {
                const parts = packData[subName];
                if (Object.keys(parts).length === 0) continue;

                html += `<div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-radius: 6px;">
                    <div style="font-weight: 600; color: #374151; margin-bottom: 10px; font-size: 13px;">${subName}</div>`;

                for (const partName in parts) {
                    const problems = parts[partName];
                    if (problems.length === 0) continue;

                    html += `<div style="margin-bottom: 10px;">
                        <div style="font-size: 12px; color: #9ca3af; margin-bottom: 6px;">${partName}</div>`;

                    for (const problem of problems) {
                        html += `<div style="padding: 8px 12px; background: white; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 5px; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#f3f4f6'; this.style.borderColor='#667eea';"
                                onmouseout="this.style.background='white'; this.style.borderColor='#e5e7eb';"
                                onclick="window.open('${CODENV_URL}?id=${problem.id}', '_blank')">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #1f2937; font-size: 13px;">${problem.name}</span>
                                <span style="color: #9ca3af; font-size: 11px;">ID: ${problem.id}</span>
                            </div>
                        </div>`;
                    }

                    html += `</div>`;
                }

                html += `</div>`;
            }

            html += `</div>`;
        }

        resultsArea.innerHTML = html;
        updateCacheInfo();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Public API ───────────────────────────────────────────────────
    function init() {
        if (!window.location.hostname.includes('skillrack.com')) return;

        createButton();
        createPanel();
    }

    return {
        init,
        scan: scanAllPacks,
        getResults: () => incompleteQuestions,
        getCacheTimestamp: () => lastScanTimestamp,
        isScanning: () => isScanning
    };
})();

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(IncompleteQuestionsModule.init, 1000));
} else {
    setTimeout(IncompleteQuestionsModule.init, 1000);
}