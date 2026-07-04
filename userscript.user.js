// ==UserScript==
// @name         Anti-Cheat Bypass
// @namespace    http://tampermonkey.net/
// @version      5.0f
// @description  Bypass tab switching, copy/paste restrictions, full-screen enforcement, auto-solve captcha, and AI-powered solution generator
// @author       ToonTamilIndia (Captcha solver by adithyagenie)
// @match        https://*.skillrack.com/*
// @match        https://skillrack.com/*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js
// @require      https://js.puter.com/v2/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// @downloadURL https://raw.githubusercontent.com/ToonTamilIndia/skillrack-userscript/refs/heads/main/userscript.user.js
// @updateURL https://raw.githubusercontent.com/ToonTamilIndia/skillrack-userscript/refs/heads/main/userscript.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================
    // SCRIPT VERSION & REMOTE URLS
    // ============================================
    const SCRIPT_VERSION = '5.0';
    const REMOTE_SCRIPT_URL = 'https://raw.githubusercontent.com/ToonTamilIndia/skillrack-userscript/refs/heads/main/userscript.user.js';
    const KILL_SWITCH_URL = 'https://raw.githubusercontent.com/Aron-2005/solid-octo-doodle/refs/heads/main/kill.txt';
    const DISCLAIMER_ACCEPTED_KEY = 'skillrack_bypass_disclaimer_accepted';
    const SCRIPT_DISABLED_KEY = 'skillrack_bypass_disabled_by_killswitch';

    // ============================================
    // UTILITY: Compare version strings (e.g., "4.5" vs "4.6")
    // ============================================
    const compareVersions = (local, remote) => {
        const localParts = local.split('.').map(Number);
        const remoteParts = remote.split('.').map(Number);

        for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
            const l = localParts[i] || 0;
            const r = remoteParts[i] || 0;
            if (r > l) return -1; // Remote is newer
            if (l > r) return 1;  // Local is newer
        }
        return 0; // Equal
    };

    // ============================================
    // KILL SWITCH CHECK
    // ============================================
    const checkKillSwitch = async () => {
        try {
            const response = await fetch(KILL_SWITCH_URL + '?t=' + Date.now(), {
                cache: 'no-store'
            });
            if (!response.ok) {
                console.log('[SkillRack Bypass] Kill switch check failed, allowing script to run');
                return true; // Allow if can't fetch
            }
            const text = (await response.text()).trim().toLowerCase();
            if (text === 'false') {
                console.log('[SkillRack Bypass] Kill switch activated - script disabled');
                localStorage.setItem(SCRIPT_DISABLED_KEY, 'true');
                return false;
            }
            localStorage.removeItem(SCRIPT_DISABLED_KEY);
            return true;
        } catch (e) {
            console.log('[SkillRack Bypass] Kill switch check error:', e);
            return true; // Allow if error
        }
    };

    // ============================================
    // VERSION CHECK
    // ============================================
    const checkForUpdate = async () => {
        try {
            const response = await fetch(REMOTE_SCRIPT_URL + '?t=' + Date.now(), {
                cache: 'no-store'
            });
            if (!response.ok) return null;

            const scriptText = await response.text();
            // Extract version from @version line
            const versionMatch = scriptText.match(/@version\s+(\d+\.\d+(?:\.\d+)?)/);
            if (versionMatch) {
                return versionMatch[1];
            }
        } catch (e) {
            console.log('[SkillRack Bypass] Version check error:', e);
        }
        return null;
    };

    // ============================================
    // SHOW MANDATORY UPDATE DIALOG
    // ============================================
    const showUpdateDialog = (remoteVersion) => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'bypass-update-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'VT323', monospace;
            `;

            overlay.innerHTML = `
                <div style="
                    background: rgba(15,15,15,0.97);
                    border-radius: 20px;
                    padding: 36px 32px;
                    max-width: 450px;
                    text-align: center;
                    box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
                    border: 1px solid rgba(239,68,68,0.3);
                    animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;
                ">
                    <div style="margin-bottom: 16px;">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="#f44336">
                            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"></path>
                        </svg>
                    </div>
                    <h2 style="margin:0 0 14px;font-size:26px;font-weight:800;font-family:'VT323',monospace;background:linear-gradient(90deg,#ef4444,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Update Required</h2>
                    <p style="color: #fff; margin: 0 0 8px 0; font-size: 18px;">
                        A new version of SkillRack Bypass is available!
                    </p>
                    <p style="color: #888; margin: 0 0 24px 0; font-size: 17px;">
                        Your version: <span style="color: #ff9800;">${SCRIPT_VERSION}</span><br>
                        Latest version: <span style="color: #4CAF50;">${remoteVersion}</span>
                    </p>
                    <p style="color: #ff9800; margin: 0 0 24px 0; font-size: 16px;">
                        You must update to continue using this script.
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="bypass-update-btn" style="
                            background: linear-gradient(135deg,#22c55e,#16a34a);
                            color: white;
                            border: none;
                            padding: 11px 28px;
                            border-radius: 10px;
                            font-size: 17px;
                            font-weight: 700;
                            cursor: pointer;
                            font-family: 'VT323', monospace;
                            letter-spacing: 0.3px;
                            transition: transform 0.2s, box-shadow 0.2s;
                            box-shadow: 0 4px 16px rgba(34,197,94,0.3);
" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">Update Now</button>
                        <button id="bypass-update-close" style="
                            background: rgba(255,255,255,0.06);
                            color: #71717a;
                            border: 1px solid rgba(255,255,255,0.1);
                            padding: 11px 20px;
                            border-radius: 10px;
                            font-size: 17px;
                            font-family: 'VT323', monospace;
                            cursor: pointer;
                            transition: background 0.2s;
" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">Close (Disable Script)</button>
                    </div>
                </div>
            `;

            const addToBody = () => {
                document.body.appendChild(overlay);

                document.getElementById('bypass-update-btn').addEventListener('click', () => {
                    window.open(REMOTE_SCRIPT_URL, '_blank');
                    // Keep dialog open so they can update
                });

                document.getElementById('bypass-update-close').addEventListener('click', () => {
                    overlay.remove();
                    resolve(false); // User chose not to update
                });
            };

            if (document.body) {
                addToBody();
            } else {
                document.addEventListener('DOMContentLoaded', addToBody);
            }
        });
    };

    // ============================================
    // SHOW KILL SWITCH DISABLED MESSAGE
    // ============================================
    const showKillSwitchMessage = () => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'VT323', monospace;
        `;

        overlay.innerHTML = `
            <div style="
                background: rgba(15,15,15,0.97);
                border-radius: 20px;
                padding: 36px 32px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
                border: 1px solid rgba(239,68,68,0.3);
                animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;
            ">
                <div style="margin-bottom: 16px;">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="#f44336">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm5.31-3.1L6.69 6.29C8.04 5.23 9.74 4.6 11.4 4.6c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"></path>
                    </svg>
                </div>
                <h2 style="margin:0 0 14px;font-size:26px;font-weight:800;font-family:'VT323',monospace;background:linear-gradient(90deg,#ef4444,#dc2626);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Script Disabled</h2>
                <p style="color: #fff; margin: 0 0 16px 0; font-size: 18px;">
                    This script has been temporarily disabled by the author.
                </p>
                <p style="color: #888; margin: 0; font-size: 16px;">
                    Please check back later or visit the GitHub repository for updates.
                </p>
            </div>
        `;

        if (document.body) {
            document.body.appendChild(overlay);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(overlay);
            });
        }
    };

    // ============================================
    // SHOW FIRST-TIME DISCLAIMER
    // ============================================
    const showDisclaimer = () => {
        return new Promise((resolve) => {
            // Check if already accepted
            if (localStorage.getItem(DISCLAIMER_ACCEPTED_KEY) === 'true') {
                resolve(true);
                return;
            }

            const overlay = document.createElement('div');
            overlay.id = 'bypass-disclaimer-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'VT323', monospace;
            `;

            overlay.innerHTML = `
                <div style="
                    background: rgba(15,15,15,0.97);
                    border-radius: 20px;
                    padding: 36px 32px;
                    max-width: 500px;
                    text-align: center;
                    box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
                    border: 1px solid rgba(249,115,22,0.35);
                    animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;
                ">
                    <div style="margin-bottom: 16px;">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="#ff9800">
                            <path d="M12 2L1 21h22L12 2zm0 3.45L20.14 19H3.86L12 5.45zM13 17h-2v-2h2v2zm0-4h-2v-4h2v4z"></path>
                        </svg>
                    </div>
                    <h2 style="margin:0 0 14px;font-size:24px;font-weight:800;font-family:'VT323',monospace;background:linear-gradient(90deg,#f97316,#eab308);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Disclaimer & Terms of Use</h2>
                    <div style="
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                        padding: 14px 16px;
                        margin-bottom: 18px;
                        text-align: left;
                        max-height: 200px;
                        overflow-y: auto;
                        font-size: 16px;
                        color: #a1a1aa;
                        line-height: 1.65;
                        font-family: 'VT323', monospace;
                    ">
                        <p style="margin: 0 0 12px 0;"><strong style="color: #f44336;">IMPORTANT - READ CAREFULLY:</strong></p>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li style="margin-bottom: 8px;">This script is provided <strong>"AS IS"</strong> without any warranty of any kind.</li>
                            <li style="margin-bottom: 8px;">The author(s) are <strong>NOT RESPONSIBLE</strong> for any consequences arising from the use of this script, including but not limited to:
                                <ul style="margin-top: 4px; padding-left: 16px;">
                                    <li>Academic penalties or disciplinary actions</li>
                                    <li>Account suspension or termination</li>
                                    <li>Legal consequences</li>
                                    <li>Any damage to your academic record</li>
                                </ul>
                            </li>
                            <li style="margin-bottom: 8px;">By using this script, you acknowledge that bypassing anti-cheat measures may violate your institution's academic integrity policies.</li>
                            <li style="margin-bottom: 8px;">You are <strong>solely responsible</strong> for your actions and any consequences that may result.</li>
                            <li style="margin-bottom: 8px;">This script is for <strong>educational purposes only</strong>.</li>
                        </ul>
                    </div>
                    <p style="color: #888; margin: 0 0 20px 0; font-size: 15px;">
                        By clicking "I Accept", you confirm that you have read, understood, and agree to these terms.
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="bypass-accept-btn" style="
                            background: linear-gradient(135deg,#22c55e,#16a34a);
                            color: white;
                            border: none;
                            padding: 11px 28px;
                            border-radius: 10px;
                            font-size: 17px;
                            font-weight: 700;
                            cursor: pointer;
                            font-family: 'VT323', monospace;
                            letter-spacing: 0.3px;
                            box-shadow: 0 4px 16px rgba(34,197,94,0.3);
                            transition: transform 0.2s;
" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">I Accept & Understand</button>
                        <button id="bypass-decline-btn" style="
                            background: rgba(255,255,255,0.06);
                            color: #71717a;
                            border: 1px solid rgba(255,255,255,0.1);
                            padding: 11px 20px;
                            border-radius: 10px;
                            font-size: 17px;
                            font-family: 'VT323', monospace;
                            cursor: pointer;
                            transition: background 0.2s;
" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">Decline</button>
                    </div>
                </div>
            `;

            const addToBody = () => {
                document.body.appendChild(overlay);

                // Use setTimeout to ensure elements are fully rendered (Firefox compatibility)
                setTimeout(() => {
                    const acceptBtn = document.getElementById('bypass-accept-btn');
                    const declineBtn = document.getElementById('bypass-decline-btn');

                    if (acceptBtn) {
                        acceptBtn.addEventListener('click', () => {
                            localStorage.setItem(DISCLAIMER_ACCEPTED_KEY, 'true');
                            overlay.remove();
                            resolve(true);
                        });
                    }

                    if (declineBtn) {
                        declineBtn.addEventListener('click', () => {
                            overlay.remove();
                            resolve(false);
                        });
                    }
                }, 0);
            };

            if (document.body) {
                addToBody();
            } else {
                document.addEventListener('DOMContentLoaded', addToBody);
            }
        });
    };

    // ============================================
    // INITIALIZATION CHECK (Kill Switch, Update, Disclaimer)
    // ============================================
    const initializeScript = async () => {
        // Step 1: Check kill switch
        const killSwitchOk = await checkKillSwitch();
        if (!killSwitchOk) {
            showKillSwitchMessage();
            return false;
        }

        // Step 2: Check for updates
        const remoteVersion = await checkForUpdate();
        if (remoteVersion && compareVersions(SCRIPT_VERSION, remoteVersion) < 0) {
            const userAcceptedUpdate = await showUpdateDialog(remoteVersion);
            if (!userAcceptedUpdate) {
                console.log('[SkillRack Bypass] User declined update - script disabled');
                return false;
            }
        }

        // Step 3: Show disclaimer (first time only)
        const disclaimerAccepted = await showDisclaimer();
        if (!disclaimerAccepted) {
            console.log('[SkillRack Bypass] User declined disclaimer - script disabled');
            return false;
        }

        return true;
    };

    // Run initialization and only continue if all checks pass
    let scriptEnabled = false;
    let initCallbacks = [];

    // Register a callback to run when script is enabled
    const onScriptEnabled = (callback) => {
        if (scriptEnabled) {
            callback();
        } else {
            initCallbacks.push(callback);
        }
    };

    // We need to run async initialization but continue with the rest of the script
    // For features that run at document-start, we'll check scriptEnabled flag
    (async () => {
        scriptEnabled = await initializeScript();
        if (scriptEnabled) {
            console.log('[SkillRack Bypass] All checks passed - script enabled');
            // Run all registered callbacks
            initCallbacks.forEach(cb => {
                try { cb(); } catch (e) { console.error('[SkillRack Bypass] Callback error:', e); }
            });
            initCallbacks = [];
        }
    })();

    // ============================================
    // SETTINGS - Toggle features on/off
    // ============================================
    const DEFAULT_SETTINGS = {
        // Anti-cheat bypasses
        bypassTabDetection: true,
        bypassCopyPaste: true,
        bypassFullscreen: true,
        bypassMultiMonitor: true,
        blockTelemetry: true,
        enableDragDrop: true,
        enableTextSelection: true,
        enableContextMenu: true,
        enableFullScreenCopyMode: false,
        enablePopupMode: false,

        // Captcha solver (credit: adithyagenie)
        enableCaptchaSolver: true,
        captchaUsername: "",

        // AI Solution Generator
        enableAISolver: false,
        includePrePostCode: false,
        aiTemperature: 0,
        aiSystemPrompt: "",
        aiProvider: "gemini",
        geminiApiKey: "",
        geminiModel: "gemini-2.5-flash",
        openaiApiKey: "",
        openaiModel: "gpt-4o-mini",
        openrouterApiKey: "",
        openrouterModel: "qwen/qwen3-coder:free",
        puterModel: "gpt-5.4-nano",
        puterCustomModel: "",
        puterEnableReasoning: false,
        puterReasoningEffort: "low",

        // ========== G4F SETTINGS (NEW) ==========
        g4fApiKey: "",
        g4fModel: "auto",
        // ========================================

        // ========== DUCKDUCKGO SETTINGS (NEW) ==========
        duckduckgoModel: "gpt-4o-mini",
        duckduckgoApiUrl: "https://duckduckgo-api.toontamilindia.workers.dev",
        duckduckgoApiKey: "",
        duckduckgoIncludeReasoning: false,
        duckduckgoReasoningEffort: "low",
        // ================================================

        // ========== YUPPBRIDGE SETTINGS (NEW) ==========
        yuppbridgeApiUrl: "",
        yuppbridgeApiKey: "",
        yuppbridgeModel: "gpt-4o",
        // ================================================

        // ========== AUTO SOLVER SETTINGS ==========
        enableAutoSolver: false,
        autoSolverMaxRetries: 3,
        autoSolverDelay: 500,
        // ==========================================

        // ========== FIND INCOMPLETE SETTINGS ==========
        enableFindIncomplete: true,
        // ===============================================
    };

    // Load settings from localStorage or use defaults
    const loadSettings = () => {
        try {
            let saved = null;
            if (typeof GM_getValue !== 'undefined') {
                saved = GM_getValue('skillrack_bypass_settings', null);
            }
            if (!saved) {
                saved = localStorage.getItem('skillrack_bypass_settings');
            }
            if (saved) {
                const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
                if (merged.autoSolverMaxRetries < 2) merged.autoSolverMaxRetries = 5;
                return merged;
            }
        } catch (e) {
            console.log('Failed to load settings:', e);
        }
        return { ...DEFAULT_SETTINGS };
    };

    const saveSettings = (settings) => {
        try {
            const str = JSON.stringify(settings);
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue('skillrack_bypass_settings', str);
            }
            localStorage.setItem('skillrack_bypass_settings', str);
        } catch (e) {
            console.log('Failed to save settings:', e);
        }
    };

    let SETTINGS = loadSettings();

    const notifyPopup = (message) => {
        if (!SETTINGS.enablePopupMode) {
            console.warn('[Popup disabled]', message);
            return;
        }
        alert(message);
    };

    const FULLSCREEN_COPY_PROMPT = '\n\nReturn a structured answer with: Summary, Inputs, Outputs, Constraints, Approach, Complexity, and Final Solution.';

    // ============================================
    // GEMINI PROVIDER MODULE (DYNAMIC MODEL LOADING)
    // ============================================

    const GeminiProvider = (function () {
        'use strict';

        const CONFIG = {
            API_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
            CACHE_KEY: 'gemini_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours cache
            DEFAULT_MODEL: 'gemini-2.5-flash'
        };

        function getApiKey() {
            return SETTINGS.geminiApiKey || null;
        }

        function normalizeModel(rawModel) {
            const name = rawModel.name || '';
            const id = name.replace('models/', '');
            const displayName = rawModel.displayName || id;
            const description = rawModel.description || '';

            // Categorize models
            let category = 'Other';
            if (id.includes('gemini-2')) category = 'Gemini 2.x';
            else if (id.includes('gemini-1.5')) category = 'Gemini 1.5';
            else if (id.includes('gemini-1.0') || id.includes('gemini-pro')) category = 'Gemini 1.0';
            else if (id.includes('text-embedding') || id.includes('embedding')) category = 'Embeddings';
            else if (id.includes('aqa')) category = 'AQA';

            return {
                id: id,
                name: displayName,
                description: description,
                category: category,
                supportedMethods: rawModel.supportedGenerationMethods || [],
                inputTokenLimit: rawModel.inputTokenLimit || 0,
                outputTokenLimit: rawModel.outputTokenLimit || 0
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (cached) {
                    const { models, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CONFIG.CACHE_TTL) {
                        return models;
                    }
                }
            } catch (e) {
                console.log('[Gemini] Cache read error:', e);
            }
            return null;
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.log('[Gemini] Cache write error:', e);
            }
        }

        function clearCache() {
            localStorage.removeItem(CONFIG.CACHE_KEY);
        }

        async function fetchModels(forceRefresh = false) {
            const apiKey = getApiKey();
            if (!apiKey) {
                console.log('[Gemini] No API key, using fallback models');
                return getFallbackModels();
            }

            if (!forceRefresh) {
                const cached = getCachedModels();
                if (cached) {
                    console.log('[Gemini] Using cached models:', cached.length);
                    return cached;
                }
            }

            try {
                const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const rawModels = data.models || [];

                // Filter to only generative models (exclude embeddings, etc.)
                const models = rawModels
                    .filter(m => {
                        const methods = m.supportedGenerationMethods || [];
                        return methods.includes('generateContent');
                    })
                    .map(normalizeModel)
                    .sort((a, b) => {
                        // Sort by category priority, then by name
                        const categoryOrder = ['Gemini 2.x', 'Gemini 1.5', 'Gemini 1.0', 'Other'];
                        const aIdx = categoryOrder.indexOf(a.category);
                        const bIdx = categoryOrder.indexOf(b.category);
                        if (aIdx !== bIdx) return aIdx - bIdx;
                        return a.name.localeCompare(b.name);
                    });

                console.log('[Gemini] Fetched models:', models.length);
                setCachedModels(models);
                return models;
            } catch (error) {
                console.error('[Gemini] Fetch error:', error);
                return getFallbackModels();
            }
        }

        function getFallbackModels() {
            return [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'Gemini 2.x', description: 'Fast and efficient' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', category: 'Gemini 2.x', description: 'Most capable model' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', category: 'Gemini 2.x', description: 'Previous generation flash' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', category: 'Gemini 1.5', description: 'Fast multimodal model' },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', category: 'Gemini 1.5', description: 'Advanced reasoning' },
            ];
        }

        function filterModels(models, query) {
            if (!query) return models;
            const lowerQuery = query.toLowerCase();
            return models.filter(m =>
                m.id.toLowerCase().includes(lowerQuery) ||
                m.name.toLowerCase().includes(lowerQuery) ||
                m.category.toLowerCase().includes(lowerQuery)
            );
        }

        function groupModels(models) {
            const groups = {};
            models.forEach(model => {
                if (!groups[model.category]) groups[model.category] = [];
                groups[model.category].push(model);
            });
            return groups;
        }

        return {
            CONFIG,
            fetchModels,
            filterModels,
            groupModels,
            clearCache,
            normalizeModel
        };
    })();

    // ============================================
    // OPENAI PROVIDER MODULE (DYNAMIC MODEL LOADING)
    // ============================================

    const OpenAIProvider = (function () {
        'use strict';

        const CONFIG = {
            API_URL: 'https://api.openai.com/v1/models',
            CACHE_KEY: 'openai_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours cache
            DEFAULT_MODEL: 'gpt-4o-mini'
        };

        function getApiKey() {
            return SETTINGS.openaiApiKey || null;
        }

        function normalizeModel(rawModel) {
            const id = rawModel.id || '';

            // Categorize models
            let category = 'Other';
            let displayName = id;

            if (id.startsWith('gpt-4o')) {
                category = 'GPT-4o';
                displayName = id.replace('gpt-4o', 'GPT-4o').replace(/-/g, ' ');
            } else if (id.startsWith('gpt-4')) {
                category = 'GPT-4';
                displayName = id.replace('gpt-4', 'GPT-4').replace(/-/g, ' ');
            } else if (id.startsWith('gpt-3.5')) {
                category = 'GPT-3.5';
                displayName = id.replace('gpt-3.5', 'GPT-3.5').replace(/-/g, ' ');
            } else if (id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
                category = 'Reasoning (o-series)';
                displayName = id.toUpperCase().replace(/-/g, ' ');
            } else if (id.includes('davinci') || id.includes('curie') || id.includes('babbage') || id.includes('ada')) {
                category = 'Legacy';
            }

            return {
                id: id,
                name: displayName,
                category: category,
                ownedBy: rawModel.owned_by || 'openai'
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (cached) {
                    const { models, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CONFIG.CACHE_TTL) {
                        return models;
                    }
                }
            } catch (e) {
                console.log('[OpenAI] Cache read error:', e);
            }
            return null;
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.log('[OpenAI] Cache write error:', e);
            }
        }

        function clearCache() {
            localStorage.removeItem(CONFIG.CACHE_KEY);
        }

        async function fetchModels(forceRefresh = false) {
            const apiKey = getApiKey();
            if (!apiKey) {
                console.log('[OpenAI] No API key, using fallback models');
                return getFallbackModels();
            }

            if (!forceRefresh) {
                const cached = getCachedModels();
                if (cached) {
                    console.log('[OpenAI] Using cached models:', cached.length);
                    return cached;
                }
            }

            try {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const rawModels = data.data || [];

                // Filter to only chat completion models
                const chatModelPatterns = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'chatgpt'];
                const excludePatterns = ['instruct', 'vision', 'audio', 'realtime', 'tts', 'whisper', 'dall-e', 'embedding', 'moderation'];

                const models = rawModels
                    .filter(m => {
                        const id = m.id.toLowerCase();
                        const isChat = chatModelPatterns.some(p => id.includes(p));
                        const isExcluded = excludePatterns.some(p => id.includes(p));
                        return isChat && !isExcluded;
                    })
                    .map(normalizeModel)
                    .sort((a, b) => {
                        // Sort by category priority, then by name
                        const categoryOrder = ['GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Legacy', 'Other'];
                        const aIdx = categoryOrder.indexOf(a.category);
                        const bIdx = categoryOrder.indexOf(b.category);
                        if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                        return a.name.localeCompare(b.name);
                    });

                console.log('[OpenAI] Fetched models:', models.length);
                setCachedModels(models);
                return models;
            } catch (error) {
                console.error('[OpenAI] Fetch error:', error);
                return getFallbackModels();
            }
        }

        function getFallbackModels() {
            return [
                { id: 'gpt-4o', name: 'GPT-4o', category: 'GPT-4o', ownedBy: 'openai' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'GPT-4o', ownedBy: 'openai' },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', category: 'GPT-4', ownedBy: 'openai' },
                { id: 'gpt-4', name: 'GPT-4', category: 'GPT-4', ownedBy: 'openai' },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', category: 'GPT-3.5', ownedBy: 'openai' },
                { id: 'o1', name: 'O1', category: 'Reasoning (o-series)', ownedBy: 'openai' },
                { id: 'o1-mini', name: 'O1 Mini', category: 'Reasoning (o-series)', ownedBy: 'openai' },
                { id: 'o3-mini', name: 'O3 Mini', category: 'Reasoning (o-series)', ownedBy: 'openai' },
            ];
        }

        function filterModels(models, query) {
            if (!query) return models;
            const lowerQuery = query.toLowerCase();
            return models.filter(m =>
                m.id.toLowerCase().includes(lowerQuery) ||
                m.name.toLowerCase().includes(lowerQuery) ||
                m.category.toLowerCase().includes(lowerQuery)
            );
        }

        function groupModels(models) {
            const groups = {};
            models.forEach(model => {
                if (!groups[model.category]) groups[model.category] = [];
                groups[model.category].push(model);
            });
            return groups;
        }

        return {
            CONFIG,
            fetchModels,
            filterModels,
            groupModels,
            clearCache,
            normalizeModel
        };
    })();

    // ============================================
    // OPENROUTER PROVIDER MODULE (DYNAMIC MODEL LOADING)
    // ============================================

    const OpenRouterProvider = (function () {
        'use strict';

        const CONFIG = {
            // Use official API endpoint which has proper CORS support
            API_URL: 'https://openrouter.ai/api/v1/models',
            CACHE_KEY: 'openrouter_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours cache
            DEFAULT_MODEL: 'google/gemini-2.0-flash-001'
        };

        // Get API key from settings
        function getApiKey() {
            return SETTINGS.openrouterApiKey || null;
        }

        function normalizeModel(rawModel) {
            // Handle official API response format
            const pricing = rawModel.pricing || {};
            const promptPrice = parseFloat(pricing.prompt || 0);
            const completionPrice = parseFloat(pricing.completion || 0);
            const isFree = promptPrice === 0 && completionPrice === 0;

            // Extract author from model ID (e.g., "google/gemini-2.0-flash" -> "google")
            const idParts = (rawModel.id || '').split('/');
            const author = idParts.length > 1 ? idParts[0] : 'unknown';
            const shortName = idParts.length > 1 ? idParts[idParts.length - 1] : rawModel.id;

            // Determine group based on author
            const groupMap = {
                'google': 'Google',
                'anthropic': 'Anthropic',
                'openai': 'OpenAI',
                'meta-llama': 'Meta',
                'meta': 'Meta',
                'mistralai': 'Mistral',
                'deepseek': 'DeepSeek',
                'qwen': 'Qwen',
                'nvidia': 'NVIDIA',
                'cohere': 'Cohere',
                'perplexity': 'Perplexity',
                'x-ai': 'xAI'
            };
            const group = groupMap[author.toLowerCase()] || 'Other';

            return {
                id: rawModel.id || '',
                name: rawModel.name || shortName || 'Unknown',
                fullName: rawModel.name || rawModel.id || 'Unknown',
                author: author,
                group: group,
                description: rawModel.description || '',
                context_length: rawModel.context_length || null,
                isFree: isFree,
                supportsReasoning: false,
                inputModalities: ['text'],
                outputModalities: ['text']
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (!cached) return null;

                const { models, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;

                if (age > CONFIG.CACHE_TTL) {
                    localStorage.removeItem(CONFIG.CACHE_KEY);
                    return null;
                }

                return models;
            } catch (error) {
                try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (e) { }
                return null;
            }
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.error('[OpenRouter] Cache write error:', error);
            }
        }

        function clearCache() {
            try {
                localStorage.removeItem(CONFIG.CACHE_KEY);
            } catch (error) { }
        }

        async function fetchModels(forceRefresh = false) {
            if (!forceRefresh) {
                const cachedModels = getCachedModels();
                if (cachedModels && cachedModels.length > 0) {
                    console.log('[OpenRouter] Using cached models:', cachedModels.length);
                    return cachedModels;
                }
            }

            const apiKey = getApiKey();
            if (!apiKey) {
                console.log('[OpenRouter] No API key, using fallback models');
                return getFallbackModels();
            }

            console.log('[OpenRouter] Fetching models from API...');

            // Wrap the entire network call so CORS errors, DNS failures, and
            // any other network-level exceptions fall back gracefully.
            let response;
            try {
                response = await fetch(CONFIG.API_URL, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'SkillRack Bypass'
                    }
                });
            } catch (networkErr) {
                console.warn('[OpenRouter] Network error while fetching models:', networkErr.message);
                return getFallbackModels();
            }

            if (!response.ok) {
                // Try to extract a helpful error message from the body.
                let errDetail = '';
                try {
                    const errBody = await response.json();
                    errDetail = errBody?.error?.message || errBody?.message || '';
                } catch (_) {
                    try { errDetail = await response.text(); } catch (_2) { }
                }
                console.warn(
                    `[OpenRouter] Models API HTTP ${response.status}` +
                    (errDetail ? `: ${errDetail}` : '') +
                    ' — using fallback models'
                );
                return getFallbackModels();
            }

            let rawResponse;
            try {
                rawResponse = await response.json();
            } catch (parseErr) {
                console.warn('[OpenRouter] Failed to parse models response JSON:', parseErr.message);
                return getFallbackModels();
            }

            let modelArray = [];

            // API returns { data: [...] }
            if (rawResponse && rawResponse.data && Array.isArray(rawResponse.data)) {
                modelArray = rawResponse.data;
            } else if (Array.isArray(rawResponse)) {
                modelArray = rawResponse;
            } else {
                console.warn('[OpenRouter] Unexpected models response shape — using fallback models');
                return getFallbackModels();
            }

            // Filter and normalize models
            const normalizedModels = modelArray
                .filter(m => m && m.id)
                .map(m => normalizeModel(m))
                .sort((a, b) => {
                    // Sort: Free first, then by group, then by name
                    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
                    if (a.group !== b.group) return a.group.localeCompare(b.group);
                    return a.name.localeCompare(b.name);
                });

            console.log('[OpenRouter] Fetched models:', normalizedModels.length);

            if (normalizedModels.length > 0) {
                setCachedModels(normalizedModels);
            } else {
                console.warn('[OpenRouter] Fetched 0 models — falling back to built-in list');
                return getFallbackModels();
            }

            return normalizedModels;
        }

        function getFallbackModels() {
            return [
                { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B (Free)', author: 'qwen', group: 'Qwen', isFree: true },
                { id: 'poolside/laguna-m.1:free', name: 'Laguna M.1 Coder (Free)', author: 'poolside', group: 'Poolside', isFree: true },
                { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1 Coder (Free)', author: 'poolside', group: 'Poolside', isFree: true },
                { id: 'poolside/laguna-xs.2:free', name: 'Laguna XS.2 Coder (Free)', author: 'poolside', group: 'Poolside', isFree: true },
                { id: 'cohere/north-mini-code:free', name: 'North Mini Code 30B (Free)', author: 'cohere', group: 'Cohere', isFree: true },
                { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron Ultra 550B (Free)', author: 'nvidia', group: 'NVIDIA', isFree: true },
                { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super 120B (Free)', author: 'nvidia', group: 'NVIDIA', isFree: true },
                { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (Free)', author: 'google', group: 'Google', isFree: true },
                { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B MoE (Free)', author: 'google', group: 'Google', isFree: true },
                { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', author: 'meta-llama', group: 'Meta', isFree: true },
                { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', author: 'qwen', group: 'Qwen', isFree: true },
                { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (Free)', author: 'openai', group: 'OpenAI', isFree: true },
                { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (Free)', author: 'openai', group: 'OpenAI', isFree: true },
                { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', author: 'openai', group: 'OpenAI', isFree: false },
                { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', author: 'anthropic', group: 'Anthropic', isFree: false },
            ].map(m => ({ ...m, fullName: m.name, description: '', context_length: null, supportsReasoning: false, inputModalities: ['text'], outputModalities: ['text'] }));
        }

        function filterModels(models, query) {
            if (!query || typeof query !== 'string' || !Array.isArray(models)) {
                return models || [];
            }

            const lowerQuery = query.toLowerCase().trim();
            if (!lowerQuery) return models;

            return models.filter(model => {
                const id = (model.id || '').toLowerCase();
                const name = (model.name || '').toLowerCase();
                const fullName = (model.fullName || '').toLowerCase();
                const author = (model.author || '').toLowerCase();
                const group = (model.group || '').toLowerCase();
                return id.includes(lowerQuery) ||
                    name.includes(lowerQuery) ||
                    fullName.includes(lowerQuery) ||
                    author.includes(lowerQuery) ||
                    group.includes(lowerQuery);
            });
        }

        function groupModels(models) {
            const groups = {};
            const freeModels = [];

            for (const model of models) {
                if (model.isFree) {
                    freeModels.push(model);
                } else {
                    const group = model.group || 'Other';
                    if (!groups[group]) groups[group] = [];
                    groups[group].push(model);
                }
            }

            return { freeModels, groups };
        }

        return {
            CONFIG,
            fetchModels,
            filterModels,
            groupModels,
            clearCache,
            normalizeModel
        };
    })();

    // ============================================
    // PUTER.JS PROVIDER MODULE (STATIC MODEL CATALOG)
    // ============================================

    const PuterProvider = (function () {
        'use strict';

        const CONFIG = {
            DEFAULT_MODEL: 'gpt-5.4-nano'
        };

        const MODEL_GROUPS = {
            'OpenAI': [
                'gpt-5.5-pro', 'gpt-5.5', 'gpt-5.4-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
                'gpt-5.3-chat', 'gpt-5.3-codex', 'gpt-5.2-pro', 'gpt-5.2', 'gpt-5.2-chat',
                'gpt-5.1', 'gpt-5.1-chat-latest', 'gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5.1-codex-max',
                'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest', 'gpt-4.5-preview',
                'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini',
                'o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini', 'o4-mini',
                'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b',
                'openai/gpt-oss-120b:free', 'openai/gpt-oss-20b:free'
            ],
            'Anthropic': [
                'claude-opus-4.7-fast', 'claude-opus-4-7', 'claude-opus-4.6-fast', 'claude-opus-4-6',
                'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
                'claude-opus-4-1', 'claude-opus-4', 'claude-sonnet-4',
                'anthropic/claude-opus-4.1', 'anthropic/claude-opus-4.6-fast', 'anthropic/claude-opus-4.6'
            ],
            'Google Gemini': [
                'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3-pro-preview',
                'gemini-2.5-pro', 'gemini-2.5-pro-preview', 'gemini-2.5-pro-preview-05-06',
                'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite-preview-09-2025',
                'gemini-2.5-flash-preview-09-2025', 'gemini-2.0-flash-001', 'gemini-2.0-flash', 'gemini-2.0-flash-lite',
                'gemini-2.0-flash-lite-001'
            ],
            'Google Gemma': [
                'google/gemma-4-31b-it', 'google/gemma-4-26b-a4b-it', 'google/gemma-3-27b-it', 'google/gemma-3-12b-it',
                'google/gemma-3-4b-it', 'google/gemma-3n-e4b-it', 'google/gemma-2-27b-it'
            ],
            'DeepSeek': [
                'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-r1-0528', 'deepseek/deepseek-r1',
                'deepseek/deepseek-v3.2', 'deepseek/deepseek-v3.2-exp', 'deepseek/deepseek-v3.1-terminus',
                'deepseek/deepseek-v3.1-terminus:exacto', 'deepseek/deepseek-chat-v3-0324', 'deepseek/deepseek-chat-v3.1',
                'deepseek/deepseek-r1-distill-qwen-32b'
            ],
            'Meta Llama': [
                'meta-llama/llama-4-maverick', 'meta-llama/llama-4-scout', 'meta-llama/llama-3.3-70b-instruct',
                'meta-llama/llama-3.1-70b-instruct', 'meta-llama/llama-3.1-8b-instruct', 'meta-llama/llama-3-70b-instruct',
                'meta-llama/llama-3-8b-instruct', 'meta-llama/llama-3.2-11b-vision-instruct', 'meta-llama/llama-3.2-3b-instruct',
                'meta-llama/llama-3.2-1b-instruct', 'meta-llama/llama-guard-4-12b', 'meta-llama/llama-guard-3-8b'
            ],
            'Qwen': [
                'qwen/qwen3-max', 'qwen/qwen3-max-thinking', 'qwen/qwen3-235b-a22b', 'qwen/qwen3-235b-a22b-thinking-2507',
                'qwen/qwen3-235b-a22b-2507', 'qwen/qwen3-30b-a3b', 'qwen/qwen3-30b-a3b-instruct-2507',
                'qwen/qwen3-30b-a3b-thinking-2507', 'qwen/qwen3-32b', 'qwen/qwen3-14b', 'qwen/qwen3-8b',
                'qwen/qwen3-coder-480b-a35b-instruct', 'qwen/qwen3-coder-480b-a35b-instruct:free', 'qwen/qwen3-coder-30b-a3b-instruct',
                'qwen/qwen3-coder-next', 'qwen/qwen3-coder-plus', 'qwen/qwen3-coder-flash',
                'qwen/qwen3-vl-235b-a22b', 'qwen/qwen3-vl-235b-a22b-thinking', 'qwen/qwen3-vl-30b-a3b-instruct',
                'qwen/qwen3-vl-30b-a3b-thinking', 'qwen/qwen3-vl-32b-instruct', 'qwen/qwen3-vl-8b-instruct',
                'qwen/qwen3-vl-8b-thinking', 'qwen/qwen3.5-plus', 'qwen/qwen3.5-35b-a3b', 'qwen/qwen3.5-397b-a17b',
                'qwen/qwen3.5-122b-a10b', 'qwen/qwen3.5-27b', 'qwen/qwen3.5-9b'
            ],
            'Mistral': [
                'mistralai/mistral-medium-3-5', 'mistralai/mistral-medium-2508', 'mistralai/mistral-medium-3.1',
                'mistralai/mistral-small-2603', 'mistralai/mistral-small-3.2-24b-instruct', 'mistralai/mistral-small-3.1-24b-instruct',
                'mistralai/mistral-small-24b-instruct-2501', 'mistralai/magistral-medium-2509', 'mistralai/magistral-small-2509',
                'mistralai/mistral-saba', 'mistralai/mistral-large-2411', 'mistralai/mistral-large-2512', 'mistralai/mistral-large-2407',
                'mistralai/pixtral-large-2411', 'mistralai/pixtral-12b',
                'mistralai/ministral-14b-2512', 'mistralai/ministral-8b', 'mistralai/ministral-8b-2512', 'mistralai/ministral-3b', 'mistralai/ministral-3b-2512',
                'mistralai/devstral-2512', 'mistralai/devstral-medium', 'mistralai/devstral-small',
                'mistralai/voxtral-small-2507', 'mistralai/voxtral-small-24b-2507',
                'mistralai/codestral-2508',
                'mistralai/mistral-7b-instruct-v0.3', 'mistralai/mistral-7b-instruct-v0.2', 'mistralai/mistral-7b-instruct',
                'mistralai/mistral-tiny', 'mistralai/mixtral-8x22b-instruct'
            ],
            'xAI': [
                'x-ai/grok-4.20', 'x-ai/grok-4.1-fast', 'x-ai/grok-4.20-multi-agent', 'x-ai/grok-3-beta',
                'x-ai/grok-3-mini-beta'
            ],
            'OpenRouter / Other': [
                'z-ai/glm-5.1', 'z-ai/glm-5', 'z-ai/glm-5-turbo', 'z-ai/glm-4.7', 'z-ai/glm-4.7-flash', 'z-ai/glm-4.6',
                'z-ai/glm-4.5', 'z-ai/glm-4.5-air', 'z-ai/glm-4.5-air:free',
                'openrouter/free', 'openrouter/bodybuilder', 'openrouter/elephant-alpha', 'perplexity/sonar',
                'perplexity/sonar-pro', 'perplexity/sonar-reasoning-pro', 'perplexity/sonar-deep-research',
                'perplexity/sonar-pro-search', 'cohere/command-a', 'cohere/command-r-08-2024', 'cohere/command-r-plus-08-2024',
                'cohere/command-r7b-12-2024', 'ibm-granite/granite-4.0-h-micro', 'amazon/nova-pro-v1', 'amazon/nova-premier-v1',
                'amazon/nova-lite-v1', 'amazon/nova-micro-v1', 'amazon/nova-2-lite-v1', 'liquid/lfm-2.24b-a2b',
                'liquid/lfm-2.5-1.2b-instruct:free', 'liquid/lfm-2.5-1.2b-thinking:free', 'nousresearch/hermes-4-405b',
                'nousresearch/hermes-4-70b', 'nousresearch/hermes-3-llama-3.1-405b', 'nousresearch/hermes-3-llama-3.1-405b:free',
                'nousresearch/hermes-3-llama-3.1-70b', 'nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-super-120b-a12b:free',
                'nvidia/nemotron-3-nano-30b-a3b', 'nvidia/nemotron-3-nano-30b-a3b:free', 'nvidia/nemotron-nano-9b-v2',
                'nvidia/nemotron-nano-9b-v2:free', 'microsoft/phi-4', 'microsoft/wizardlm-2-8x22b', 'moonshotai/kimi-k2',
                'moonshotai/kimi-k2-0905', 'moonshotai/kimi-k2-thinking', 'moonshotai/kimi-k2.5', 'minimax/minimax-m2.5',
                'minimax/minimax-m2.5:free', 'minimax/minimax-m2.7', 'minimax/minimax-m2.1', 'minimax/minimax-m2',
                'minimax/minimax-01', 'tencent/hunyuan-a13b-instruct', 'writer/palmyra-x5', 'upstage/solar-pro-3',
                'stepfun/step-3.5-flash', 'prime-intellect/intellect-3', 'rekaai/reka-edge', 'rekaai/reka-flash-3',
                'bytedance-seed/seed-1.6', 'bytedance-seed/seed-1.6-flash', 'bytedance-seed/seed-2.0-lite', 'bytedance-seed/seed-2.0-mini',
                'bytedance/ui-tars-1.5-7b', 'xiaomi/mimo-v2-pro', 'xiaomi/mimo-v2-flash', 'xiaomi/mimo-v2-omni',
                'anthracite-org/magnum-v4-72b', 'aion-labs/aion-2.0', 'aion-labs/aion-1.0', 'aion-labs/aion-1.0-mini',
                'ai21/jamba-large-1.7', 'allenai/olmo-3-32b-think', 'arcee-ai/coder-large', 'arcee-ai/maestro-reasoning',
                'arcee-ai/trinity-large-thinking', 'arcee-ai/trinity-large-preview:free', 'arcee-ai/trinity-mini', 'arcee-ai/spotlight'
            ]
        };

        function normalizeModel(model) {
            const aliases = new Set(model.aliases || []);
            if (model.id && model.id.includes('/')) {
                aliases.add(model.id.split('/').pop());
            }
            return {
                id: model.id,
                name: model.name,
                group: model.group,
                description: model.description || '',
                aliases: Array.from(aliases)
            };
        }

        function makeModel(id, group, description = '', aliases = []) {
            const shortName = id.includes('/') ? id.split('/').pop() : id;
            return normalizeModel({
                id,
                name: shortName,
                group,
                description,
                aliases
            });
        }

        function getModels() {
            const models = [];
            for (const [group, ids] of Object.entries(MODEL_GROUPS)) {
                for (const id of ids) {
                    models.push(makeModel(id, group, ''));
                }
            }
            return models;
        }

        function filterModels(models, query) {
            if (!query) return models;
            const lowerQuery = query.toLowerCase().trim();
            if (!lowerQuery) return models;
            return models.filter(model => {
                const aliases = Array.isArray(model.aliases) ? model.aliases : [];
                return (model.id || '').toLowerCase().includes(lowerQuery) ||
                    (model.name || '').toLowerCase().includes(lowerQuery) ||
                    (model.group || '').toLowerCase().includes(lowerQuery) ||
                    (model.description || '').toLowerCase().includes(lowerQuery) ||
                    aliases.some(alias => String(alias).toLowerCase().includes(lowerQuery));
            });
        }

        function groupModels(models) {
            const groups = {};
            (models || []).forEach(model => {
                const group = model.group || 'Other';
                if (!groups[group]) groups[group] = [];
                groups[group].push(model);
            });
            return groups;
        }

        return {
            CONFIG,
            getModels,
            filterModels,
            groupModels
        };
    })();

    // ============================================
    // G4F PROVIDER MODULE (NEW)
    // ============================================

    const G4FProvider = (function () {
        'use strict';

        const CONFIG = {
            BASE_URL: 'https://g4f.space',
            CACHE_KEY: 'g4f_models_cache',
            CACHE_TTL: 24 * 60 * 60 * 1000,
            DEFAULT_MODEL: 'auto'
        };

        function getApiKey() {
            return SETTINGS.g4fApiKey || null;
        }

        function normalizeModel(rawModel) {
            const nameParts = (rawModel.id || '').split('/');
            const displayName = nameParts.length > 1
                ? nameParts[nameParts.length - 1]
                : rawModel.id;

            return {
                id: rawModel.id || '',
                name: displayName || rawModel.id || 'Unknown Model',
                owner: rawModel.owned_by || 'unknown',
                context_window: rawModel.context_window || rawModel.max_tokens || null
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (!cached) return null;

                const { models, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;

                if (age > CONFIG.CACHE_TTL) {
                    localStorage.removeItem(CONFIG.CACHE_KEY);
                    return null;
                }

                return models;
            } catch (error) {
                try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (e) { }
                return null;
            }
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.error('[G4F] Cache write error:', error);
            }
        }

        function clearCache() {
            try {
                localStorage.removeItem(CONFIG.CACHE_KEY);
            } catch (error) { }
        }

        async function fetchModels(forceRefresh = false) {
            if (!forceRefresh) {
                const cachedModels = getCachedModels();
                if (cachedModels && cachedModels.length > 0) {
                    return cachedModels;
                }
            }

            const apiKey = getApiKey();
            if (!apiKey) {
                throw new Error('G4F API key not configured. Please add it in settings.');
            }

            const response = await fetch(`${CONFIG.BASE_URL}/v1/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Failed to fetch G4F models: ${response.status}`);
            }

            const rawResponse = await response.json();
            let modelArray;

            if (Array.isArray(rawResponse)) {
                modelArray = rawResponse;
            } else if (rawResponse.data && Array.isArray(rawResponse.data)) {
                modelArray = rawResponse.data;
            } else if (rawResponse.models && Array.isArray(rawResponse.models)) {
                modelArray = rawResponse.models;
            } else {
                modelArray = [];
            }

            const normalizedModels = modelArray
                .filter(m => m && m.id)
                .map(m => normalizeModel(m));

            if (normalizedModels.length > 0) {
                setCachedModels(normalizedModels);
            }

            return normalizedModels;
        }

        function filterModels(models, query) {
            if (!query || typeof query !== 'string' || !Array.isArray(models)) {
                return models || [];
            }

            const lowerQuery = query.toLowerCase().trim();
            if (!lowerQuery) return models;

            return models.filter(model => {
                const id = (model.id || '').toLowerCase();
                const name = (model.name || '').toLowerCase();
                const owner = (model.owner || '').toLowerCase();
                return id.includes(lowerQuery) || name.includes(lowerQuery) || owner.includes(lowerQuery);
            });
        }

        async function generateCompletion(messages, options = {}) {
            const apiKey = getApiKey();
            if (!apiKey) {
                throw new Error('G4F API key not configured. Please add it in settings.');
            }

            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Messages array is required');
            }

            const model = options.model || CONFIG.DEFAULT_MODEL;
            const payload = {
                model: model,
                messages: messages
            };
            payload.temperature = options.temperature ?? SETTINGS.aiTemperature;
            if (typeof options.max_tokens === 'number') payload.max_tokens = options.max_tokens;

            const response = await fetch(`${CONFIG.BASE_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorMessage = `G4F API request failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error?.message) errorMessage = errorData.error.message;
                } catch (e) { }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('G4F returned empty response');
            }

            return content;
        }

        return {
            CONFIG,
            fetchModels,
            filterModels,
            clearCache,
            generateCompletion,
            getApiKey,
            normalizeModel
        };
    })();

    // G4F wrapper function (NEW)
    const generateWithG4F = async (prompt) => {
        const model = SETTINGS.g4fModel || 'auto';
        return await G4FProvider.generateCompletion(
            [{ role: 'user', content: prompt }],
            { model: model, temperature: SETTINGS.aiTemperature, max_tokens: 2048 }
        );
    };

    // ============================================
    // DUCKDUCKGO PROVIDER MODULE (Uses Proxy API to avoid CSP)
    // ============================================

    const DuckDuckGoProvider = (function () {
        'use strict';

        const CONFIG = {
            DEFAULT_API_URL: 'https://duckduckgo-api.toontamilindia.workers.dev',
            DEFAULT_MODEL: 'gpt-4o-mini'
        };

        const AVAILABLE_MODELS = [
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', owner: 'OpenAI', desc: 'General-purpose AI' },
            { id: 'gpt-5-mini', name: 'GPT-5 Mini (Beta)', owner: 'OpenAI', desc: 'Reasoning AI' },
            { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', owner: 'OpenAI', desc: 'Open source, Reasoning AI' },
            { id: 'llama-4-scout', name: 'Llama 4 Scout', owner: 'Meta', desc: 'Open source' },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', owner: 'Anthropic', desc: 'General-purpose + Reasoning AI' },
            { id: 'mistral-small-3', name: 'Mistral Small 3', owner: 'Mistral AI', desc: 'Open source' }
        ];
        const REASONING_MODELS = new Set(['gpt-5-mini', 'gpt-oss-120b', 'claude-haiku-4-5']);
        const REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'none']);

        function getApiUrl() {
            return SETTINGS.duckduckgoApiUrl || CONFIG.DEFAULT_API_URL;
        }

        function getApiKey() {
            return SETTINGS.duckduckgoApiKey || '';
        }

        function supportsReasoningModel(modelId) {
            return REASONING_MODELS.has(modelId);
        }

        function normalizeReasoningEffort(value) {
            const effort = `${value || ''}`.toLowerCase();
            if (effort === 'none') return undefined;
            return REASONING_EFFORTS.has(effort) ? effort : 'low';
        }

        async function generateCompletion(messages, options = {}) {
            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Messages array is required');
            }

            const apiUrl = getApiUrl();
            const apiKey = getApiKey();
            const modelName = options.model || SETTINGS.duckduckgoModel || CONFIG.DEFAULT_MODEL;
            const includeReasoning = Boolean(options.includeReasoning ?? SETTINGS.duckduckgoIncludeReasoning);
            const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort || SETTINGS.duckduckgoReasoningEffort);
            const requestReasoning = includeReasoning && supportsReasoningModel(modelName);

            const headers = {
                'Content-Type': 'application/json'
            };

            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }

            const payload = {
                messages: messages,
                model: modelName
            };
            if (requestReasoning) {
                payload.include_reasoning = true;
                if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
            }

            const response = await fetch(`${apiUrl}/chat`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorMessage = `DuckDuckGo AI Proxy request failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) { }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const choice = data.choices?.[0] || {};
            const message = choice.message || {};
            const content = message.content;
            const reasoning = message.reasoning || choice.reasoning || data.reasoning || '';

            if (!content && !(requestReasoning && reasoning)) {
                throw new Error('DuckDuckGo AI Proxy returned empty response');
            }

            if (requestReasoning && reasoning) {
                const reasoningBlock = `[Reasoning]\n${reasoning}`;
                return content ? `${reasoningBlock}\n\n${content}` : reasoningBlock;
            }

            return content;
        }

        function getModels() {
            return AVAILABLE_MODELS;
        }

        return {
            CONFIG,
            getModels,
            generateCompletion,
            getApiUrl
        };
    })();

    // DuckDuckGo wrapper function
    const generateWithDuckDuckGo = async (prompt) => {
        const model = SETTINGS.duckduckgoModel || 'gpt-4o-mini';
        return await DuckDuckGoProvider.generateCompletion(
            [{ role: 'user', content: prompt }],
            {
                model: model,
                includeReasoning: SETTINGS.duckduckgoIncludeReasoning,
                reasoningEffort: SETTINGS.duckduckgoReasoningEffort
            }
        );
    };

    // ============================================
    // YUPPBRIDGE PROVIDER MODULE (200+ Models from Yupp AI)
    // Self-hosted OpenAI-compatible API
    // https://github.com/cloudWaddie/yuppbridge
    // ============================================

    const YuppBridgeProvider = (function () {
        'use strict';

        const CONFIG = {
            CACHE_KEY: 'yuppbridge_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours cache
            DEFAULT_MODEL: 'gpt-4o'
        };

        // Clean up YuppBridge response artifacts (removes <yapp> tags, [Variant] markers, etc.)
        function cleanYuppBridgeResponse(content) {
            if (!content || typeof content !== 'string') return content;

            // Remove [Variant] markers and everything after
            let cleaned = content.replace(/\[Variant\][\s\S]*$/i, '');

            // Remove <yapp> tags and their contents
            cleaned = cleaned.replace(/<yapp[^>]*>[\s\S]*?<\/yapp>/gi, '');

            // Remove any standalone [Variant] that might be in the middle
            cleaned = cleaned.replace(/\[Variant\]/gi, '');

            // Trim whitespace
            cleaned = cleaned.trim();

            // If we stripped everything, return original content with basic cleanup
            if (!cleaned) {
                console.warn('[YuppBridge] Response was completely stripped, using original');
                return content.replace(/<yapp[^>]*>[\s\S]*?<\/yapp>/gi, '').trim();
            }

            return cleaned;
        }

        function getApiUrl() {
            return SETTINGS.yuppbridgeApiUrl || '';
        }

        function getApiKey() {
            return SETTINGS.yuppbridgeApiKey || '';
        }

        function normalizeModel(rawModel) {
            const id = rawModel.id || '';
            const name = rawModel.name || id;
            const ownedBy = rawModel.owned_by || 'unknown';

            // Categorize models based on ID patterns
            let category = 'Other';
            const idLower = id.toLowerCase();

            if (idLower.includes('gpt-4o')) category = 'GPT-4o';
            else if (idLower.includes('gpt-4')) category = 'GPT-4';
            else if (idLower.includes('gpt-3.5') || idLower.includes('gpt-35')) category = 'GPT-3.5';
            else if (idLower.includes('claude')) category = 'Claude';
            else if (idLower.includes('gemini')) category = 'Gemini';
            else if (idLower.includes('llama')) category = 'Llama';
            else if (idLower.includes('mistral') || idLower.includes('mixtral')) category = 'Mistral';
            else if (idLower.includes('deepseek')) category = 'DeepSeek';
            else if (idLower.includes('qwen')) category = 'Qwen';
            else if (idLower.startsWith('o1') || idLower.startsWith('o3') || idLower.startsWith('o4')) category = 'Reasoning (o-series)';

            return {
                id: id,
                name: name,
                category: category,
                ownedBy: ownedBy
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (cached) {
                    const { models, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CONFIG.CACHE_TTL) {
                        return models;
                    }
                }
            } catch (e) {
                console.log('[YuppBridge] Cache read error:', e);
            }
            return null;
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                    models: models,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.log('[YuppBridge] Cache write error:', e);
            }
        }

        function clearCache() {
            localStorage.removeItem(CONFIG.CACHE_KEY);
        }

        async function fetchModels(forceRefresh = false) {
            const apiUrl = getApiUrl();
            if (!apiUrl) {
                console.log('[YuppBridge] No API URL configured, using fallback models');
                return getFallbackModels();
            }

            if (!forceRefresh) {
                const cached = getCachedModels();
                if (cached) {
                    console.log('[YuppBridge] Using cached models:', cached.length);
                    return cached;
                }
            }

            try {
                const headers = {
                    'Content-Type': 'application/json'
                };

                const apiKey = getApiKey();
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                console.log('[YuppBridge] Fetching models from:', `${apiUrl}/api/v1/models`);
                const response = await fetch(`${apiUrl}/api/v1/models`, {
                    method: 'GET',
                    headers: headers
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const rawModels = data.data || data.models || data || [];

                const models = (Array.isArray(rawModels) ? rawModels : [])
                    .filter(m => m && m.id)
                    .map(normalizeModel)
                    .sort((a, b) => {
                        // Sort by category, then by name
                        const categoryOrder = ['GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Claude', 'Gemini', 'Llama', 'Mistral', 'DeepSeek', 'Qwen', 'Other'];
                        const aIdx = categoryOrder.indexOf(a.category);
                        const bIdx = categoryOrder.indexOf(b.category);
                        if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                        return a.name.localeCompare(b.name);
                    });

                console.log('[YuppBridge] Fetched models:', models.length);
                setCachedModels(models);
                return models;
            } catch (error) {
                console.error('[YuppBridge] Fetch error:', error);
                return getFallbackModels();
            }
        }

        function getFallbackModels() {
            return [
                { id: 'gpt-4o', name: 'GPT-4o', category: 'GPT-4o', ownedBy: 'openai' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'GPT-4o', ownedBy: 'openai' },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', category: 'GPT-4', ownedBy: 'openai' },
                { id: 'claude-3-opus', name: 'Claude 3 Opus', category: 'Claude', ownedBy: 'anthropic' },
                { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', category: 'Claude', ownedBy: 'anthropic' },
                { id: 'claude-3-haiku', name: 'Claude 3 Haiku', category: 'Claude', ownedBy: 'anthropic' },
                { id: 'gemini-pro', name: 'Gemini Pro', category: 'Gemini', ownedBy: 'google' },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', category: 'Gemini', ownedBy: 'google' },
                { id: 'llama-3-70b', name: 'Llama 3 70B', category: 'Llama', ownedBy: 'meta' },
                { id: 'mistral-large', name: 'Mistral Large', category: 'Mistral', ownedBy: 'mistral' },
                { id: 'deepseek-coder', name: 'DeepSeek Coder', category: 'DeepSeek', ownedBy: 'deepseek' },
            ];
        }

        function filterModels(models, query) {
            if (!query) return models;
            const lowerQuery = query.toLowerCase();
            return models.filter(m =>
                m.id.toLowerCase().includes(lowerQuery) ||
                m.name.toLowerCase().includes(lowerQuery) ||
                m.category.toLowerCase().includes(lowerQuery) ||
                m.ownedBy.toLowerCase().includes(lowerQuery)
            );
        }

        function groupModels(models) {
            const groups = {};
            models.forEach(model => {
                if (!groups[model.category]) groups[model.category] = [];
                groups[model.category].push(model);
            });
            return groups;
        }

        async function generateCompletion(messages, options = {}) {
            const apiUrl = getApiUrl();
            const apiKey = getApiKey();

            if (!apiUrl) {
                throw new Error('YuppBridge API URL not configured. Please set it in settings.');
            }

            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Messages array is required');
            }

            const model = options.model || SETTINGS.yuppbridgeModel || CONFIG.DEFAULT_MODEL;
            const payload = {
                model: model,
                messages: messages
            };
            payload.temperature = options.temperature ?? SETTINGS.aiTemperature;
            if (typeof options.max_tokens === 'number') payload.max_tokens = options.max_tokens;

            const headers = {
                'Content-Type': 'application/json'
            };

            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
                console.log('[YuppBridge] Using API key (first 10 chars):', apiKey.substring(0, 10) + '...');
            } else {
                console.warn('[YuppBridge] WARNING: No API key configured!');
            }

            console.log('[YuppBridge] Sending chat request to:', `${apiUrl}/api/v1/chat/completions`, 'with model:', model);
            const response = await fetch(`${apiUrl}/api/v1/chat/completions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorMessage = `YuppBridge API request failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error?.message) errorMessage = errorData.error.message;
                    else if (errorData.error) errorMessage = errorData.error;
                } catch (e) { }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            let content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('YuppBridge returned empty response');
            }

            // Clean up YuppBridge response artifacts
            content = cleanYuppBridgeResponse(content);

            return content;
        }

        async function checkHealth() {
            const apiUrl = getApiUrl();
            if (!apiUrl) return { ok: false, error: 'No API URL configured' };

            try {
                const response = await fetch(`${apiUrl}/health`);
                if (response.ok) {
                    const data = await response.json();
                    return { ok: true, data };
                }
                return { ok: false, error: `HTTP ${response.status}` };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        }

        return {
            CONFIG,
            fetchModels,
            filterModels,
            groupModels,
            clearCache,
            normalizeModel,
            generateCompletion,
            checkHealth,
            getApiUrl,
            getApiKey
        };
    })();

    // YuppBridge wrapper function
    const generateWithYuppBridge = async (prompt) => {
        const model = SETTINGS.yuppbridgeModel || 'gpt-4o';
        return await YuppBridgeProvider.generateCompletion(
            [{ role: 'user', content: prompt }],
            { model: model, temperature: SETTINGS.aiTemperature, max_tokens: 2048 }
        );
    };

    // ============================================
    // SETTINGS UI
    // ============================================
    const createSettingsUI = () => {
        // Inject Google Fonts once
        if (!document.getElementById('bypass-gfont')) {
            const gfont = document.createElement('link');
            gfont.id = 'bypass-gfont';
            gfont.rel = 'stylesheet';
            gfont.href = 'https://fonts.googleapis.com/css2?family=VT323&display=swap';
            document.head.appendChild(gfont);
        }

        // Inject keyframe animations once
        if (!document.getElementById('bypass-keyframes')) {
            const ks = document.createElement('style');
            ks.id = 'bypass-keyframes';
            ks.textContent = `
                @keyframes bypassPulse {
                    0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5), 0 8px 32px rgba(0,0,0,0.6); }
                    50%      { box-shadow: 0 0 0 10px rgba(239,68,68,0),  0 8px 32px rgba(0,0,0,0.6); }
                }
                @keyframes bypassSlideIn {
                    from { opacity:0; transform:translateY(20px) scale(0.95); }
                    to   { opacity:1; transform:translateY(0)     scale(1);    }
                }
                @keyframes bypassFadeIn {
                    from { opacity:0; }
                    to   { opacity:1; }
                }
                @keyframes bypassSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes bypassGlow {
                    0%,100% { filter: drop-shadow(0 0 4px rgba(239,68,68,0.6)); }
                    50%      { filter: drop-shadow(0 0 12px rgba(239,68,68,1)); }
                }
                #bypass-settings-panel::-webkit-scrollbar { width:5px; }
                #bypass-settings-panel::-webkit-scrollbar-track { background:transparent; }
                #bypass-settings-panel::-webkit-scrollbar-thumb { background:#3f3f46; border-radius:4px; }
                #bypass-settings-panel::-webkit-scrollbar-thumb:hover { background:#52525b; }
            `;
            document.head.appendChild(ks);
        }

         // Create settings button with custom pixel-art icon
        const settingsBtn = document.createElement('button');
        settingsBtn.title = 'Bypass Settings';
        settingsBtn.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAeDklEQVR42m16Z4xk2XndOd99sUJXde6emZ6ZnbRpZnMO3F2Sq6WkpShSlE0JNGlBpmQbFiAYEJz1QzAMwzYMCIIESLQtS7YlixYlmWYmLW7Ou9wd7uxOjj0znbsr13vv3vv5R1WHodzoHnTXe3Pj+eI5rNVmQBAAAYVCARJQVRAKUDH8IggOXuHgEQgAg183f9n8QxWAgiSGg2+9Nnisg3mGY27NsGMVxOYD1e3Zt4cAANlaxeBv7ngaKAK94SMdrgpOt4bTrf+sCoVyaw7F5og62M6OOXR7j7rjhG5cyeb4Opx96+nWtIBsf6Kqm0MOfmIiIhTcGpKEA/aJjhEWKoCQAghAqKFGWwvV4fs7t6ObG1UFObyb4fCbJ7C1Hx2ch+489BsuYHjKg9vZ+cJgQAN0hvDZWhNBGGBJeVTQ9VCA3sdCIQuFAUJoE1CoIyNoMbzAIVQMVKF2e8Id+9txY9y6FhJK/P+/hlA3aVodDkaAiAG/edgAS9AYyAjBEJQG6AMADhEN1UOhRIWVwnrvK17r6jOKCPcREaUJNQpHEPBkGQigOUU4NJXNeba/NxFNgMbITmTxhr0MbzD4sf07blulhzpiGlBFBwg2j6gErHlE8KOFfnrP1NPTIxebnSvdrNHLVnvZO5nrWxsF5hoYgzmRqDpQiTZAUDahMECZ3ugFdGioKmK6vX4UhiJUbq8QN/gbmDipbC2ZpAdiwAAFUAYUWAdmgQ4ZAyWgAI1qlci9Tii13bsrkrsr6c3V0iPT9cdmx35ysjaWxu81OpH3XZEUGkF7pLnxKIdnP/iMxNZVDExTpN3tPvHwfVleNNsdI+YG+HALmTBpUt5xQXSKVEAgB0LAQ0vAOBCBDSAHq9AEqBGJcyPk/UZv8VnFZlevra91+o1Or9/L7y/H49QP2r06oeCKyMAl6ACfWzjfQg10y4cSCAJptTs//fQTv/YrX/jW959vt7smMNse+UbbCQaWsnlHmgAdhQAR0Ac8Oaa6j2hAE2BBASAl9lBT6qMx70vkwIGZ8i2HguffuJ4VHUWl22Ab95nwHfpz4FVKqsigGegAw80AsekqCLXYBn4QmFar/fRHHv7i5/9283t/3V9YlCSF9yQAJXeEAhKqAg6sc2hEQhAw0BIUQKpYJC8Ac8QcsBc6KpwROOAcJBCzP0R859Hs736ptHuypLbii92TlfrnPjU7O37MFy2KqBqoAxWYgMoOgxs4jM3VE9DAmHa78/QTj/zUTz7Teunl5a9/01Jkc726jfzNUQgTJ5WBSRhFQOQggBKQgAINwP3EOWWNPCI6KWhY17HaVix6RJTZLJ/qtpMPftQ7P7+EMLD5+KG97pe/FJ88gYUF47TttQlmRBWIoZ0h1JVkGZqBUB04lNCYbrf7sccfeuzRR/3y4sHm8lffOP5hWg6993qjD9oRQEyaVLY8vQCOqAIHySaQAXvIOar1GqmPyQ8KfyyNf366Pmb1VGbHCBNEB+CLK9fnnWlHkYoxq2ulN16bP3HuubZ9jsE8CKIHVoAOmA+CPyBED6BicPtGpN/vP/zA3UeP3tkv7Ef2T579yl/+RV/7xmArOG2H9m1nKzusgkoK0Acy4DbqMQG8+zBzM1EYRuFzfX0qiX9tuj6hWMttB3rS+mYQnpXw9aC0HsXOoyVmGeHK1dX/2bKveVlTLFM82CebQLh59aOEAoFXAzVARLq8uPuO2/cdvn319LmP7x299txLr5y/2o0jo34LN0Ok61ZIJsBgmCSoVzABFLDQea8zhvQ6Af7W4Zl7puunrq1++eLyy/3i3PxaJ3fHvR40wTnrRyP5i1Yf3kfkd5u935iuXy7szVHwopcrQAzsUb1GTkP3Ee8pFBRoFzAYevcS2SvsHXcc3TV3oHPx4k88fnfju9//w++9mldr3ut2yACU+jfjsUmTCnekgtNEA5wVthVh4X9zz8TusWq702cUHaqkHxstz3eyVws3bthxetHai85ezD0Vr/WL05m9oxT9VaO7LwnWM+s91lU96bzuM7ICrIEGGgEejIEZuHHoQu52zc1NzM611tY+Ols1b7/1rTd+9EpSVqI99LbcCfrtmDywgSSpDDYZEAJMQmcAL2wU/uNRECuWO/2bxqpz4yOjpTgv3G7vL/bso6Xw6dHS3mrpcj+/0suvWNf0WjJyqpdbr2928/czeyw0/3rP+E+MV3/U6l2yrikC6C5ojxKoF+e86q0hnDFrzqsJH7l5v7zxxrV3j7+UVHNjvGpO+mFOf6Pt7kigTZyUB28MHOgauBs6Sr1YYI8ELeceHImN8Fone2+5Oab6w/XuRav3V5OPzk1+bKb2uen6AyOlJLPLhTcikeJQaH52qvalPeMbrd7caGUuMrsK+06/yEQmgBxsqx4LzRcrycud/D2Lw6ksd/ujExPT85dOnj3XL1U+NKECRjUjdSvEDiyA2JlUEDBpUlEgIqpQBVNAiI7TplVQAso4tNvLX1lujas73ug938mtyH3VOA0MKer1SKX08ZnRer//fLv/xdHyv7nrpsd3je0KTF34O+eXFtv5B+3sSmF7wrJIj4Tzj4Xm1U7+dDX5+9P1P17p1pNgYXV9cWV1r8EFBssUB/SG6cNg2eR27rFZI5EgTZJUBhubAUDWibZ1D0Xhz5bir/XyhFyz/jvdIldczPxrmT3v/QOxOZKGpWqpauT6cuNao73U7c+V4nPN7idmR6fT+PLC6nvX15ser3Szt3L/6V2jD0yNrLZ6HxQuhKrqW53iqWq8SprCF7l/PbfjofYkrKufl6AtMqo+BjoUs+V2NnOg7fKNBGCSpCKABQTcTxREXuinyrEjdxl5K7PGcCyQs4V/v3CnvQ3AcRrNi8sbnfmNTklVgW5WXOnkr2ROcjuR541+kQZyuZu/lbnHE/NLc6NHK+mJ1eZMHO43Zj1zR+LgSBrdEZovr3TGTbDmfcNDiJi6ZEJLWjKnbFVtO9LnHfn1phFXAUTQPlgBRqBNj9VCD4YyGXBfEv3qzMh9I6kr3HJur3ltqV/1EMhUIHD+euFEte/95cy9kbsaOC7seH+uZ9/L7Enrpmjazc5fr7WcyBdG0qvd/B3rn60mK4V7tZk9lIQfOt8NWA2kEENoqJpA+6TbkZ96oAQYaA4Iub0FgvX6jEIjoA4dIej8SsFny9GdsbzYtj8/mkyV4vOeqxutv2znPyiKUUpXtUzuEjNtpAQ41RXn2/ALipLiJhOMCzZUP3Cuo/pAEI6JnLDFs6Wo6dxL8JnBcsf9dBh68LJz58VHgbFAD5z0VoGmmJzUTbSIgqRXharnziQcqmqSpELAEik4Tlwp/E1GPl6Olgv/Yuaq6puK1U7/QuZ+UDgFR4hJMhW2vL/gdUV9AX1qvPzFsXJY+J+sp+esfbWwy6pL3sfCDeCqc4HIKPSE0yKRZqEdpx1wSd110XIgGVgohHSqOdgaQH/znGOoJZTc0WAYhmSCJknKCg2AKbJpfaIsQR4fLT09N3Gh0fmrbl7kftHqa9aOiW96TooYoZDTxhwwMivyTBrOGXm3V7zYL2YoddWOMiAOBFjxSIASmDt33GlDcaFbdJ3OCktwLjRVI03QKkgImFEKMtjKfsgEKCs6EG4mDz9WQg76JrSAAwqFBTvwPityxS/tm3jzw2vfK2winApxq5i6+LdzX6OMC1NgSnja6Q9y91gQNJwLhC3vX8ltR7En0DHqEnQ8CGpB8Jmp0YP1yrevrEwnEaz9k9V2EQSJkWWFV3iCgAUm1XnFkjFGVRUxNAAaJKg7ejg3tAKGEAJgCPEaKxOhgLvh8sJJ4aDqBOXAXFEeMxoAVx2OBcG4wQdWC9XPpOGhNDyb2UBxZxRcLnxTYdVVw/Cf7p96LAmfrKZPjJZPr7YnvH7+8My90/VSs3u8cC3QA4YgkAIZEBGOkpEJoEQZ6IIFWVEUWyvejgokhqkEalCS4jSG3BzIeCjNzLrc9hQzwrPO5mQfyME9cKcdM+iocK/BomLVoZ25s861FE3rT3vtqD6cRv9stpY7vLrWXS3ca6udxW7WVry83JyBXu9mJ/OiRxhFAVahBVkAXTADY2gKDCo4S45DDdClAAigwY4aSIeRmIzJaWDFYZTigU/V4kNjIy81srb171m/DKVhDdhH/aDQJcUIuaRIBR1FR31IzaA9yLz6i949GprPVeMLPfvuRu+pifJ4GLzV7L1pMQE9nrt+p79s/Vu5rwsyyiDZaZKiKEM9MQtYckZtmQQlVV0AZVD5Kwpy0NscFvVJUiGYEeOqqXDD+hGKcf5wKTpYir7Z6J9xdjY0G4qMuB3utEcLLBk5EJq+8Egotxj0yIK4rnoVqKl+NAws2fDaVuSZfaedvVi4AvhMNZ4O5FSuC6ozoj1Va0SBlOwCQobEBDBFNBUbpIDT0A2gBwoQDIt/wZZH0s2iHopL4EHRFaoHWg4rvaweBhXRMlAROKv7BG3ldY8SWPFcKYrRMDjuMCbskFe8LwCqL4s55eCsN147Xv88wzlX7DLmwVDagkNh0LH+kuNug8XC54ocmIY6cJVIFNPEGUUOBJA5+CtgAwC0pOgBjgQ0BCLVNoVQGeyqDBRAH5wNuOJdAL3cdyq8LY2gbFp/1GAWet0pFPcb88nY/FQpcdar6vtWG96XCQcNgD655rVndd76d63fgN8AxoB70/By3x5vZ3siuS2Wc1YtWQB7oCnQBlPVm6kbgAdqwDHRguwCuSJW1KAybLch3K6Q1SRJVUELpEAFGpMLTkETeb8/MnfVSx+tlXrAlX5+yPD1Qg9J+HBijlXiW2tpkrsTuesIVhwyRcu6hHSqqfKy13WwBK55rYrvgbEyhL6X612pCUW+1ytywYTICHEGUiaOBtKh9MiEnBVSeIHiRcrAPuGiiFP1ZJUIoetKQwAMtvxqmwiVR6iJQL3fkwQXuvncSClz9vHQNMLgRJGPS3AkkIjYXU1rUdBnexdlxXkQrdwS9AJVPedtRSRQLEHnjB4yes2772d6KAjqgg45ArTUp+RY0bviXWqig2Kand4VZeBdRDTB64qOqoATUXglzzdEKuWSkiOqG7rdGAtIeMAAFXCdWIGOCuDQVwaqudc3esV/XWjdk5plz6pyfySBSDUKlrrZxdzvC+Rq5hbUD6Jhz3kqLFDA7xW/K5AVlTc1GNd+KLjq/G2hhOAt9dLDnfyFrD8/cfDDyszMxqW1fG3miadngGq17FWt6jHAQ0NF78wZc/hwq5e/+OKbY663IqY/bHRjs7mrSrKkPgO7lJDoUde9gvxfi43dwsnQvJHZFFoXHEmC4z3X6PS+u9o9HMqCh6E47yJgSrjk1QB14ZMRAganrRObNWqzlxRhZ/mRwJtAIuL4RveuOLTefsfR7T52cWnxjrvv+Be//itJHDZanTRJnHdJHJXS5Id/+D/W6nc9/NlPvnF+7WtvXElbZyEmHK6eAAIdZFHAMllTZKp1YlH9t3r5jLCvOmZEFROCdSc1MaOGkeAry92ZODwa4/m1rKcakXsN7434Uq7TwnGDjuKCU4mq+djMWr8HoKJoOlyhT3p2V8BHRsu3VOOnugvfeOdPTnW7dGOtTmdhsUOKH/GBERcGv/vlPzn57vuf+ewnvS2++dqHvr3mjBivAHIOeTCTpBUAVHVkTKRARk4J19UvOQWxoj6n7jNY9TAqM4I3+i4D/9ZofLxTvNgvOtDbIkwbkiwRI4Ie5TJkXIsFNZcmj0ZhohuXS65/0AQdj7lQbq5EDedrUdD1sjvQu2Lz5ocXllQfuPeu+kglTRIA/+53/2h5o/lPfuMfHjqwNwP++zdeX75wclcIIRvDhGKQC6WVAeEmhAPMoNVK3G4YGqaCPYFQzJzgkvNrkAWre0KpC3q5/V7XzaseCvzuwCxAVsFJ6HXIgmIEvpBwtT6nKlqqJep8e2XNuwVKoLg5Ckbj8BsbnXIQ/LCXf7tjfRp/6TOfkImJf/lvf296ov6HX/m6kL/5679MQJ29vND4g68+N9m9mgTBMqCk2WzVDTmykAiAAmyBDlhUXgNr5LKYc5BZ+EXnWh4l6EfKwa9Olbuq/7ltT3o3bfz+0CwpO9BFygLoiBAQ71aDcvPwkzJz2FRH7cxhuem+Xm0GeeuFPPu91W7D+nXl7yw3n+9mUbfxhbmxVFBJ47tuP/KPf+u3K5XSP/8Hn+8uLa+2uiLywaWV1sbKmJEI2oNEwLT6gRUMaRejmgLL4BSUQA84p0yoM+qF7Kv+qOBuCQ4Z5E6/tZGTyKEG7tZALigVqmDNu4tgWdWJKYqiOb4/MobVmkaptJclSSvCKC1XV85ddP1/NZ+XCOPyO0IzMV4beehBP7ur0+5+9tmPVyvlTzx0Zy8rfK0uK2tSjV97/2LaWWHKhiKlxooWh9TOgGZlH2gAIXQVpCKCxsAZjzIwS71s8UAQ3hGbNtHI7fvt/tt931G9PWQTsqLYABvAXuokmYElb5tRJZ+5WYIIRW66G4GzNqku77mzGY+4PcfGpm46Vk5vDXmK6d5H7n3mF3/2VBAgiVuNDQP3hZ//qZXrC2fe/6BWq5iN5cXrK+euXK8yX6VZAefUO2B9SAtwwJHpIJYJ4RQBUQUE2ievkOqdUVbIAwbXrCwBZ9VuKCeFgPaBCrCosMApmiNwfUhMdr23p19WVXVWbW4lkriStBfW4nIr7/VVrhd2lqSws2vv9dlD6+cu/4ff/8pnP/vpSyevBx9e/u5zLz366GOrL52olkcun187feb8XIgAmIEvwHwHt8d6fWZnsysADHCAmqpeBUGOq9/IecCYB0OcslhTLKveb/i+tWmgIjKvaABe4YhZaCqy0uo88OzTz37iyW63J8ZEUdTpdL72v7/zzDNPJlHUXG90v/6NH3bdm1cXc3J1+va834vzFnuNvqkgLkWuK+p8VPHehUEY0rPXGHOdw4ZUvAdxRAGCVN3aySaha6FG9ZriHtF5ZaIeZJO+o2bZI4Smijnisvcb8BMiy17XyUmgAHLVhJjwbj2J773vnsMHD1TKKQCv2mx1jh29LU3i9cWVeJ/vtlZdZfcP/v1vm9n9M0fu25DYUpL+xvjrfza+fql9x09f3XdvlLXgnQZxfuXEyJnn+3HSUNcgOmAJiIBClapDLxQRA8qkBPSBMlEF7qEGQAiUqS3vrzk4chVY9Pquc3MBekBBGLBLTlIViIBKnk1OTd5/37EoMN9/6c2/+PZzjUbzv/zZ/zn+wenV1fXxXdOLy6vpk0/+8OSlts3a++7vRJUg76E8ahn1arv3BuEDrfla4xpMiqgiUSnMs1zCm9WCWIJEQDwkIKGASdMKCAcM/q1DC6BB9sD9AgfkihWLUZpxoSeveH/FFw/ELJPnIW2wDl0B9sHPQjtGgk731md/YmJy8o/+/BvNdueJh+556c33QmOmJsf/21e/uWt6Ytfs1NlTF776nReKbtN572ZudpUaly+79av+lo+sKc6XJ/zoHuu9Rgmzjj/75pGiMWvkrLJKJIpVETvQfpCyRV5SUYAZcICYVj+vvKSYIjecjtOMCxRoeY2AaWGVuAqJoYNa+ybV85ARQdnpq2nt/gfu6fV6754489j9d85Mjr357ofPPPHg7Uf2O+//059+LY2jEy+8sjp/IXj4c7bfcSdfQD9Tihy4z8fl9pHHXdZrFYUv1w2hvVaYt0cNTqokYAysAJH3W2IZk8SV7RYFkIEBcBO0Ch242GtWU+UtoRyLRKHXnDbV1400yQQowDYYqJsdYL2XlQ8d+LlPPXNo356b5na98PoPT5y6sG/PzMzUxH/88p8+dPfRv/e5nzn/3o/eXmi9d2nJ3v6UmT7ozr7OypjMHITN0vZqESR2bC5dPiPdZmdkVpcujy2d7ApXiSlfbFAAFjvIbpNsknwKhKoGWCGVnCIWwHWPhtVn4uBj1Sg2ciiWVuFesW40NF7RVVQJ9X45qkcuO51M/aivn37q3kOHDzc31g/eNHfnbYc/OHPhE088ZIx58O7bHn/w7pffPv77f/zVV19+2c8dxZ5jbK9xfE5bKyBRFGKzvFSn0KTVI2efTy6+u95t2azZIQPIYjoZ+DyEd6DfbI6aJCnvEEdwQN82gRzogh2PZ6Lw0UrkRELhutV9kdlw+k7h2oo2sGrt1bFbfHl6pbWS9dq1kfgffekXRqrVPMtJLQp3/523ACysq1crf/pX3/7w1Pm/8/mf+79vn9qwNPVZdVbq06zNYPmiT6qhsNJbb6d1zftMqw+vnupuXF0A6X2vOuf33NMxSdG6RjGBqh201wc8MVW3uD7xCtW21471gddxY9qeHxau4fXFXpEaGRe82i8C9QJxUQm9DWle210dpYSjo9V4cq9tr9l+/60TV8I0XW10mxsbI6Xkey+8Hgfyq7/4MyfOLnz9xXdx86O0FpVReos8Y1oVMjPx7VffCZxbjasT7ZVLUiq3Fn3e9d4FvnCtRWkvJLAcVPekQlmrTw+kVk5VSIWqH/Tx1Co8AK9V0qpGFAcNQBAqOq5OxBSUqs3L8OvV2fO9LruNWlrbVR+93NywpKmMGaI0Wh8thyuLi8fuezgQLFy59M7F5eiWx9TmgPGrl2V8TmrTpM+sjraXkrw7P3Hgk8e/eqnVPNnvjqfltSCZXb9YF3MtjAFmpBUZZA+s1adVEUAFGFxKqkqgUI1IBQxUyAQwqglBsg947wmOqZty+W4gAcQVXfAsg7Xa1HwyGa1euiVbv6pY3HX7+oGP5GfeTK69WyAqi+wJ/HWgE5QhtBKarM24wihFXEKQQBHBtePaPcvvt/utU6YaH3k8mJizC2cql16fth3SNEgL9MWo6pAf4KaOL1Id6BdE1QAjqg2RMlQBSwZAolpSH6im6knZEOkq9nt7iH6ZpqF0tijgxQQBg4sMOmHSkSjqNafr491+u5a19pOXPAt1d/risimdBiMCzoZ5r0VTU7tm4lHgYdqIeNEHS2GpGNsrRS/uLEVqu2JkKEgkoazVZ7AtGtwqNoe97AHPtt/beQkC1XF18zLoxqJHdsFx7xNqqLpAGaW0glJkOxDJvI+9FxGvnurERN2oGuVd9XbM25YYT86o7yrWaBAEqS00rXdueuS2pZNy/f0Gg7oxqbd99R3Ioita6agmo6Z9XcR4QFVl0F4cbIDbggSoqgEdUIWfUHeVgUAzClQH/QsDFMSMyIOiCrzkGBC7qG87TRSWvFVwq6AJ/sDqXiGBk04fpJ2n2U/uMrSqLzhEwP2hDHsf1i2YMsuThhxZPZcbUyT1tL8x4JpSolB4dVuRV3UH0T1UrnAYDggIqEBGrsEIUAz6kApDKOAAJT8XcE3hgTGyKrjD8HULIzIh/BnDN5weFIwRY4LdxDsOv5AES56PB1z2mhAHDQHcb3DcqgWu0NDnprvK7moRRh6g7VlIKBBFNpQAyk6aflAQBDfI6IYta3Gb4hUh/NBdbWsoBzHQe/2Bw4oHqU8arIMFKIoQasFFyBoQQltKDwWw5tVCV5VfdxgDng20o7DgLtEXHdpeEzEqgapCPRVKQ8ICFJgd/fRtsCtADTYpJ91KqXWopt0E1Q7J6qZSgUptQPZSdxk1YEcRKPYJBtcl4EOBzpKnHLuqVXCXgVV2FYXiZmEJWPJKxYrT0w4jYAvqVbmpm8EOilWHmt2hZW7iZChbM0lc3nkFW09vEHLeyJSr9x7Y8Hqz+l3CecU6MEvsg6+pzjttKL7pcK1whH7odTf1KPxFj5OKOnBAUFJ9zSED6tAqMKI6r2pVd3KQmyjZ1jtvaSV2UMZgrT49ICy30KX6Y7C6QZtKcmSkmud5EEUeaLRacRi6vAiSpFIuZVlWjuOV9Q3aYnR83HrvisICYRhZa/udThBF3SyrVsppFHW73TCOsyxP00StpaLb61nnuEPRwS1N7w0UHzf9jR8Y8aYaYQtkJH5MMbsp1SRxYP9+a20ax5U0DYBKmkZRWKuUx6pVb22llKrznX62Z3Y2NGZifFytLSdJOUkI1CrlSEy9WhmplOMonBobK8VRkWWVcnlifGxtfcOrktAhRnjjsnGjfBQEWatNb0sqtpXjwN8UFw3gKYyjCEAcx0VRxHGcZVmaJP1+FkVRXuRhGDabLVWtVMrqtbCFUKIoKooiSZMsy6Io6vV6qhChiDjnoijKspxCW9jCFtzSxpPbwu+tVfEGm9zcwE5xr94olOcOu1EMalwMUiaheh3Q6CIyODfvfWAMSO/dltjTqycHL0C9inBTOKYkvVcR7tBDcMDCc8vl/42j1GGHXf8fAFH0iB0rhcgAAAAASUVORK5CYII=" alt="Settings" style="width:46px;height:46px;object-fit:cover;border-radius:50%;display:block;transition:transform 0.3s ease,filter 0.3s ease;">`;
        settingsBtn.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99999;
            width: 58px;
            height: 58px;
            border-radius: 50%;
            border: 2px solid rgba(239,68,68,0.7);
            background: #0f0f0f;
            padding: 4px;
            cursor: pointer;
            animation: bypassPulse 2.5s infinite;
            transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), border-color 0.2s;
        `;
        settingsBtn.onmouseover = () => {
            settingsBtn.style.transform = 'scale(1.15) rotate(-5deg)';
            const img = settingsBtn.querySelector('img');
            if (img) img.style.filter = 'brightness(1.15) drop-shadow(0 0 8px rgba(239,68,68,0.8))';
        };
        settingsBtn.onmouseout = () => {
            settingsBtn.style.transform = 'scale(1) rotate(0deg)';
            const img = settingsBtn.querySelector('img');
            if (img) img.style.filter = 'none';
        };

        // Create settings panel
        const panel = document.createElement('div');
        panel.id = 'bypass-settings-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 92px;
            right: 24px;
            z-index: 99998;
            width: 340px;
            max-height: 560px;
            overflow-y: auto;
            overflow-x: hidden;
            background: rgba(15,15,15,0.97);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 18px;
            border: 1px solid rgba(239,68,68,0.25);
            box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset;
            display: none;
            font-family: 'VT323', monospace;
        `;

        const panelHeader = document.createElement('div');
        panelHeader.style.cssText = `
            padding: 18px 20px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(15,15,15,0) 60%);
            border-radius: 18px 18px 0 0;
        `;
        panelHeader.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <svg viewBox="0 0 24 24" width="22" height="22" style="flex-shrink:0;filter:drop-shadow(0 0 6px rgba(239,68,68,0.6));">
            </div>
            <small style="color:#71717a;font-size:15px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;">Configure features &amp; AI providers</small>
        `;

        const panelContent = document.createElement('div');
        panelContent.style.cssText = 'padding: 12px 14px 14px;';

        const createToggle = (id, label, checked, description = '') => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 9px 2px;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                transition: background 0.15s;
                border-radius: 8px;
                margin: 1px 0;
                cursor: pointer;
            `;
            wrapper.onmouseover = () => wrapper.style.background = 'rgba(255,255,255,0.03)';
            wrapper.onmouseout = () => wrapper.style.background = 'transparent';
            wrapper.innerHTML = `
                <div style="flex: 1; padding-right: 12px;">
                    <div style="color: #e4e4e7; font-size: 16.5px; font-weight: 500; font-family: 'VT323', monospace;">${label}</div>
                    ${description ? `<div style="color: #52525b; font-size: 14.5px; margin-top: 2px; font-family: 'VT323', monospace; line-height:1.4;">${description}</div>` : ''}
                </div>
                <label style="position: relative; display: inline-block; width: 42px; height: 23px; flex-shrink:0;">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                    <span style="
                        position: absolute;
                        cursor: pointer;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: ${checked ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#27272a'};
                        transition: background 0.25s ease, box-shadow 0.25s ease;
                        border-radius: 23px;
                        box-shadow: ${checked ? '0 0 8px rgba(239,68,68,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.4)'};
                    "></span>
                    <span style="
                        position: absolute;
                        height: 17px;
                        width: 17px;
                        left: ${checked ? '22px' : '3px'};
                        top: 3px;
                        background: white;
                        transition: left 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
                        border-radius: 50%;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                    "></span>
                </label>
            `;

            const checkbox = wrapper.querySelector('input');
            const slider = wrapper.querySelector('span:first-of-type');
            const circle = wrapper.querySelector('span:last-of-type');

            checkbox.addEventListener('change', () => {
                SETTINGS[id] = checkbox.checked;
                slider.style.background = checkbox.checked ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#27272a';
                slider.style.boxShadow = checkbox.checked ? '0 0 8px rgba(239,68,68,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.4)';
                circle.style.left = checkbox.checked ? '22px' : '3px';
                saveSettings(SETTINGS);
            });

            wrapper.addEventListener('click', (e) => {
                if (e.target.closest('label') || e.target.tagName === 'INPUT') {
                    return;
                }
                checkbox.click();
            });

            return wrapper;
        };

        const createTextInput = (id, label, value, placeholder = '') => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';
            wrapper.innerHTML = `
                <div style="color: #a1a1aa; font-size: 15px; font-weight: 600; font-family: 'VT323',monospace; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.6px;">${label}</div>
                <input type="text" id="${id}" value="${value}" placeholder="${placeholder}" style="
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.05);
                    color: #e4e4e7;
                    font-size: 16px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                " onfocus="this.style.borderColor='rgba(239,68,68,0.5)';this.style.boxShadow='0 0 0 3px rgba(239,68,68,0.1)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)';this.style.boxShadow='none'">
            `;

            const input = wrapper.querySelector('input');
            input.addEventListener('change', () => {
                SETTINGS[id] = input.value;
                saveSettings(SETTINGS);
            });

            return wrapper;
        };

        const createSectionHeader = (title, iconPath = '') => {
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 14px 2px 8px;
                margin-top: 6px;
                border-bottom: 1px solid rgba(255,255,255,0.07);
                margin-bottom: 4px;
            `;

            const iconSvg = iconPath ? `
                <svg viewBox="0 0 24 24" width="13" height="13" fill="rgba(239,68,68,0.85)">
                    <path d="${iconPath}"></path>
                </svg>` : '';

            header.innerHTML = `
                ${iconSvg}
                <span style="
                    color: #a1a1aa;
                    font-size: 14px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.4px;
                    font-family: 'VT323', monospace;
                ">${title}</span>
            `;
            return header;
        };

        // ========== G4F MODEL SELECTOR FUNCTION (NEW) ==========
        const createG4FModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'g4f-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'g4f' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">G4F Model</div>
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="g4fModelSearch" placeholder="Search models (e.g., qwen, gpt)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="g4fRefreshModels" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>
                <select id="g4fModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #ffffff;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="auto">Auto (Automatic Model Selection)</option>
                </select>
                <div id="g4fModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
            `;

            setTimeout(() => {
                const select = document.getElementById('g4fModel');
                const searchInput = document.getElementById('g4fModelSearch');
                const refreshBtn = document.getElementById('g4fRefreshModels');
                const statusDiv = document.getElementById('g4fModelStatus');

                let allModels = [];

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.g4fModel || 'auto';
                    select.innerHTML = '<option value="auto">Auto (Automatic Model Selection)</option>';

                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.id;
                        option.textContent = `${model.name} (${model.owner})`;
                        option.selected = model.id === currentValue;
                        select.appendChild(option);
                    });

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = async (forceRefresh = false) => {
                    if (!SETTINGS.g4fApiKey) {
                        if (statusDiv) statusDiv.textContent = 'Enter API key to load models';
                        return;
                    }

                    if (statusDiv) statusDiv.textContent = 'Loading models...';

                    try {
                        allModels = await G4FProvider.fetchModels(forceRefresh);
                        populateSelect(allModels);
                    } catch (error) {
                        if (statusDiv) statusDiv.textContent = `Error: ${error.message}`;
                    }
                };

                if (searchInput) {
                    searchInput.addEventListener('input', () => {
                        const filtered = G4FProvider.filterModels(allModels, searchInput.value.trim());
                        populateSelect(filtered);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.g4fModel = select.value;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };
        // ========================================================

        // Add toggles
        panelContent.appendChild(createSectionHeader('Anti-Cheat Bypasses', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'));
        panelContent.appendChild(createToggle('bypassTabDetection', 'Tab Detection Bypass', SETTINGS.bypassTabDetection, 'Prevent tab switch detection'));
        panelContent.appendChild(createToggle('bypassCopyPaste', 'Copy/Paste Bypass', SETTINGS.bypassCopyPaste, 'Enable clipboard in code editor'));
        panelContent.appendChild(createToggle('bypassFullscreen', 'Fullscreen Bypass', SETTINGS.bypassFullscreen, 'Skip fullscreen enforcement'));
        panelContent.appendChild(createToggle('bypassMultiMonitor', 'Multi-Monitor Bypass', SETTINGS.bypassMultiMonitor, 'Block monitor detection'));
        panelContent.appendChild(createToggle('blockTelemetry', 'Block Telemetry', SETTINGS.blockTelemetry, 'Block heartbeat requests'));

        panelContent.appendChild(createSectionHeader('Editor Features', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'));
        panelContent.appendChild(createToggle('enableDragDrop', 'Drag & Drop', SETTINGS.enableDragDrop, 'Enable drag & drop text'));
        panelContent.appendChild(createToggle('enableTextSelection', 'Text Selection', SETTINGS.enableTextSelection, 'Enable text selection'));
        panelContent.appendChild(createToggle('enableContextMenu', 'Context Menu', SETTINGS.enableContextMenu, 'Enable right-click menu'));
        panelContent.appendChild(createToggle('enableFullScreenCopyMode', 'Full Screen Copy Mode (Ctrl+A)', SETTINGS.enableFullScreenCopyMode, 'Copy full page text + structured prompt'));

        panelContent.appendChild(createSectionHeader('Captcha Solver', 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z'));
        panelContent.appendChild(createToggle('enableCaptchaSolver', 'Auto-Solve Captcha', SETTINGS.enableCaptchaSolver, 'Automatically solve math captcha'));
        panelContent.appendChild(createTextInput('captchaUsername', 'Username (optional)', SETTINGS.captchaUsername, 'e.g., abcd123+21@xyz'));

        panelContent.appendChild(createSectionHeader('AI Solution Generator', 'M21 16.5c0 .38-.21.71-.53.88l-7.97 4.43c-.31.17-.69.17-1 0L3.53 17.38c-.32-.17-.53-.5-.53-.88V7.5c0-.38.21-.71.53-.88l7.97-4.43c.31-.17.69-.17 1 0l7.97 4.43c.32.17.53.5.53.88v9z'));
        panelContent.appendChild(createToggle('enableAISolver', 'Enable AI Solver', SETTINGS.enableAISolver, 'Show AI solution button'));
        panelContent.appendChild(createToggle('includePrePostCode', 'Include Pre/Post Code', SETTINGS.includePrePostCode, 'Include pre/post code context. Disable to send full code to AI.'));
        panelContent.appendChild(createToggle('enablePopupMode', 'Popup Mode (Notifications)', SETTINGS.enablePopupMode, 'Show alerts and auto-solver status popups'));

        // Temperature setting
        const tempWrapper = document.createElement('div');
        tempWrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';
        tempWrapper.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="color:#a1a1aa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;font-family:'VT323',monospace;">AI Temperature</div>
                <div id="temp-value" style="color:#ef4444;font-size:16px;font-weight:700;font-family:'VT323',monospace;background:rgba(239,68,68,0.1);padding:2px 8px;border-radius:99px;border:1px solid rgba(239,68,68,0.25);">${SETTINGS.aiTemperature}</div>
            </div>
            <input type="range" id="aiTemperature" min="0" max="1" step="0.1" value="${SETTINGS.aiTemperature}" style="
                width: 100%;
                height: 5px;
                background: #27272a;
                border-radius: 3px;
                outline: none;
                cursor: pointer;
                accent-color: #ef4444;
            ">
            <div style="color:#52525b;font-size:14.5px;margin-top:5px;font-family:'VT323',monospace;">Lower = deterministic &nbsp;·&nbsp; Higher = creative</div>
        `;
        tempWrapper.querySelector('input').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            const tv = document.getElementById('temp-value'); if (tv) { tv.textContent = val; }
            SETTINGS.aiTemperature = val;
            saveSettings(SETTINGS);
        });
        panelContent.appendChild(tempWrapper);

        // Custom System Prompt
        const promptWrapper = document.createElement('div');
        promptWrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';
        promptWrapper.innerHTML = `
            <div style="color:#a1a1aa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:7px;font-family:'VT323',monospace;">Custom System Prompt</div>
            <textarea id="aiSystemPrompt" placeholder="Inject custom instructions to AI solver..." style="
                width: 100%;
                height: 62px;
                padding: 8px 10px;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                background: rgba(255,255,255,0.05);
                color: #e4e4e7;
                font-size: 15.5px;
                resize: vertical;
                box-sizing: border-box;
                font-family: 'VT323', monospace;
                outline: none;
                transition: border-color 0.2s;
" onfocus="this.style.borderColor='rgba(239,68,68,0.5)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${SETTINGS.aiSystemPrompt || ''}</textarea>
            <div style="color:#52525b;font-size:14.5px;margin-top:5px;font-family:'VT323',monospace;">Prepended to every AI request · Absolute priority</div>
        `;
        promptWrapper.querySelector('textarea').addEventListener('input', (e) => {
            SETTINGS.aiSystemPrompt = e.target.value;
            saveSettings(SETTINGS);
        });
        panelContent.appendChild(promptWrapper);

        // Special toggle for Auto Solver
        const autoSolverToggle = createToggle('enableAutoSolver', 'Auto Solver', SETTINGS.enableAutoSolver, 'Auto-solve & submit (requires AI Solver)');
        const autoSolverCheckbox = autoSolverToggle.querySelector('input[type="checkbox"]');
        if (autoSolverCheckbox) {
            autoSolverCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const confirmed = confirm(
                        'AUTO SOLVER - EXPERIMENTAL FEATURE\n\n' +
                        '• This feature is UNDER DEVELOPMENT\n' +
                        '• Errors and unexpected behavior may occur\n' +
                        '• Not fully tested on all problem types\n' +
                        '• May cause page reloads or get stuck\n\n' +
                        'USE AT YOUR OWN RISK!\n\n' +
                        'You can stop it anytime using the STOP button that appears.\n\n' +
                        'Do you want to enable Auto Solver?'
                    );
                    if (!confirmed) {
                        e.target.checked = false;
                        SETTINGS.enableAutoSolver = false;
                        saveSettings(SETTINGS);
                    }
                }
            });
        }
        panelContent.appendChild(autoSolverToggle);

        // Find Incomplete toggle
        const findIncompleteToggle = createToggle('enableFindIncomplete', 'Incomplete Question', SETTINGS.enableFindIncomplete, 'Show incomplete tracks in the dropdown (requires scan)');
        panelContent.appendChild(findIncompleteToggle);
        const findIncompleteCheckbox = findIncompleteToggle.querySelector('input');
        findIncompleteCheckbox.addEventListener('change', () => {
            if (findIncompleteCheckbox.checked) {
                if (window.FindIncompleteModule) {
                    window.FindIncompleteModule.init();
                }
            } else {
                if (window.FindIncompleteModule) {
                    window.FindIncompleteModule.cancel();
                }
                const btn = document.getElementById('find-incomplete-btn');
                if (btn) {
                    const li = btn.closest('li');
                    if (li) li.remove();
                }
            }
        });

        // AI Provider selector
        const providerWrapper = document.createElement('div');
        providerWrapper.style.cssText = 'padding: 10px 0; border-bottom: 1px solid #333;';
        providerWrapper.innerHTML = `
            <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">AI Provider</div>
            <select id="aiProvider" style="
                width: 100%;
                padding: 8px;
                border: 1px solid #444;
                border-radius: 6px;
                background: #2d2d2d;
                color: #fff;
                font-size: 16px;
                box-sizing: border-box;
            ">
                <option value="gemini" ${SETTINGS.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                <option value="openai" ${SETTINGS.aiProvider === 'openai' ? 'selected' : ''}>OpenAI (ChatGPT)</option>
                <option value="openrouter" ${SETTINGS.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter (Multi-Model)</option>
                <option value="puter" ${SETTINGS.aiProvider === 'puter' ? 'selected' : ''}>Puter.js (Free, Unlimited)</option>
                <option value="g4f" ${SETTINGS.aiProvider === 'g4f' ? 'selected' : ''}>G4F (g4f.space)</option>
                <option value="duckduckgo" ${SETTINGS.aiProvider === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo AI (FREE!)</option>
                <option value="yuppbridge" ${SETTINGS.aiProvider === 'yuppbridge' ? 'selected' : ''}>YuppBridge (200+ Models)</option>
            </select>
        `;
        const providerSelect = providerWrapper.querySelector('select');
        providerSelect.addEventListener('change', () => {
            SETTINGS.aiProvider = providerSelect.value;
            saveSettings(SETTINGS);
            // Show/hide model selectors based on provider
            const geminiModelWrapper = document.getElementById('gemini-model-wrapper');
            const openaiModelWrapper = document.getElementById('openai-model-wrapper');
            const orModelWrapper = document.getElementById('openrouter-model-wrapper');
            const puterModelWrapper = document.getElementById('puter-model-wrapper');
            const g4fModelWrapper = document.getElementById('g4f-model-wrapper');
            const ddgModelWrapper = document.getElementById('duckduckgo-model-wrapper');
            if (geminiModelWrapper) {
                geminiModelWrapper.style.display = providerSelect.value === 'gemini' ? 'block' : 'none';
            }
            if (openaiModelWrapper) {
                openaiModelWrapper.style.display = providerSelect.value === 'openai' ? 'block' : 'none';
            }
            if (orModelWrapper) {
                orModelWrapper.style.display = providerSelect.value === 'openrouter' ? 'block' : 'none';
            }
            if (puterModelWrapper) {
                puterModelWrapper.style.display = providerSelect.value === 'puter' ? 'block' : 'none';
            }
            if (g4fModelWrapper) {
                g4fModelWrapper.style.display = providerSelect.value === 'g4f' ? 'block' : 'none';
            }
            if (ddgModelWrapper) {
                ddgModelWrapper.style.display = providerSelect.value === 'duckduckgo' ? 'block' : 'none';
            }
            const yuppbridgeModelWrapper = document.getElementById('yuppbridge-model-wrapper');
            if (yuppbridgeModelWrapper) {
                yuppbridgeModelWrapper.style.display = providerSelect.value === 'yuppbridge' ? 'block' : 'none';
            }
        });
        panelContent.appendChild(providerWrapper);
        // ================================================================================

        panelContent.appendChild(createTextInput('geminiApiKey', 'Gemini API Key', SETTINGS.geminiApiKey, 'Enter your Gemini API key'));

        // ========== DYNAMIC GEMINI MODEL SELECTOR ==========
        const createGeminiModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'gemini-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'gemini' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">Gemini Model</div>
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="geminiModelSearch" placeholder="Search models (e.g., 2.5, flash, pro)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="geminiRefreshModels" title="Refresh models list" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>
                <select id="geminiModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #ffffff;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="gemini-2.5-flash">Loading models...</option>
                </select>
                <div id="geminiModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
            `;

            setTimeout(() => {
                const select = document.getElementById('geminiModel');
                const searchInput = document.getElementById('geminiModelSearch');
                const refreshBtn = document.getElementById('geminiRefreshModels');
                const statusDiv = document.getElementById('geminiModelStatus');

                let allModels = [];

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.geminiModel || 'gemini-2.5-flash';
                    select.innerHTML = '';

                    // Group models by category
                    const groups = GeminiProvider.groupModels(models);
                    const categoryOrder = ['Gemini 2.x', 'Gemini 1.5', 'Gemini 1.0', 'Other'];

                    for (const category of categoryOrder) {
                        const categoryModels = groups[category];
                        if (!categoryModels || categoryModels.length === 0) continue;

                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${category} (${categoryModels.length})`;
                        categoryModels.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = model.name;
                            option.title = model.description || '';
                            option.selected = model.id === currentValue;
                            optgroup.appendChild(option);
                        });
                        select.appendChild(optgroup);
                    }

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = async (forceRefresh = false) => {
                    if (statusDiv) statusDiv.textContent = 'Loading models...';
                    if (refreshBtn) {
                        refreshBtn.disabled = true;
                        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
                    }

                    try {
                        allModels = await GeminiProvider.fetchModels(forceRefresh);
                        populateSelect(allModels);
                        if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                    } catch (error) {
                        console.error('[Gemini] Failed to load models:', error);
                        if (statusDiv) statusDiv.textContent = `Error: ${error.message}`;
                        select.innerHTML = '<option value="gemini-2.5-flash" selected>Gemini 2.5 Flash (Default)</option>';
                    } finally {
                        if (refreshBtn) {
                            refreshBtn.disabled = false;
                            refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
                        }
                    }
                };

                if (searchInput) {
                    let searchTimeout;
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            const filtered = GeminiProvider.filterModels(allModels, searchInput.value.trim());
                            populateSelect(filtered);
                        }, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.geminiModel = select.value;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };

        panelContent.appendChild(createGeminiModelSelector());
        // ========================================================

        panelContent.appendChild(createTextInput('openaiApiKey', 'OpenAI API Key', SETTINGS.openaiApiKey, 'Enter your OpenAI API key'));

        // ========== DYNAMIC OPENAI MODEL SELECTOR ==========
        const createOpenAIModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'openai-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'openai' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">OpenAI Model</div>
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="openaiModelSearch" placeholder="Search models (e.g., gpt-4, o1, turbo)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="openaiRefreshModels" title="Refresh models list" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>
                <select id="openaiModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #ffffff;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="gpt-4o-mini">Loading models...</option>
                </select>
                <div id="openaiModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
            `;

            setTimeout(() => {
                const select = document.getElementById('openaiModel');
                const searchInput = document.getElementById('openaiModelSearch');
                const refreshBtn = document.getElementById('openaiRefreshModels');
                const statusDiv = document.getElementById('openaiModelStatus');

                let allModels = [];

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.openaiModel || 'gpt-4o-mini';
                    select.innerHTML = '';

                    // Group models by category
                    const groups = OpenAIProvider.groupModels(models);
                    const categoryOrder = ['GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Legacy', 'Other'];

                    for (const category of categoryOrder) {
                        const categoryModels = groups[category];
                        if (!categoryModels || categoryModels.length === 0) continue;

                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${category} (${categoryModels.length})`;
                        categoryModels.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = model.name;
                            option.selected = model.id === currentValue;
                            optgroup.appendChild(option);
                        });
                        select.appendChild(optgroup);
                    }

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = async (forceRefresh = false) => {
                    if (statusDiv) statusDiv.textContent = 'Loading models...';
                    if (refreshBtn) {
                        refreshBtn.disabled = true;
                        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
                    }

                    try {
                        allModels = await OpenAIProvider.fetchModels(forceRefresh);
                        populateSelect(allModels);
                        if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                    } catch (error) {
                        console.error('[OpenAI] Failed to load models:', error);
                        if (statusDiv) statusDiv.textContent = `Error: ${error.message}`;
                        select.innerHTML = '<option value="gpt-4o-mini" selected>GPT-4o Mini (Default)</option>';
                    } finally {
                        if (refreshBtn) {
                            refreshBtn.disabled = false;
                            refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
                        }
                    }
                };

                if (searchInput) {
                    let searchTimeout;
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            const filtered = OpenAIProvider.filterModels(allModels, searchInput.value.trim());
                            populateSelect(filtered);
                        }, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.openaiModel = select.value;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };

        panelContent.appendChild(createOpenAIModelSelector());
        // ========================================================

        panelContent.appendChild(createTextInput('openrouterApiKey', 'OpenRouter API Key', SETTINGS.openrouterApiKey, 'Enter your OpenRouter API key'));

        // ========== DYNAMIC OPENROUTER MODEL SELECTOR ==========
        const createOpenRouterModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'openrouter-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'openrouter' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">OpenRouter Model</div>

                <!-- Custom model ID input (highest priority) -->
                <div style="margin-bottom: 8px;">
                    <input type="text" id="orCustomModel" value="${SETTINGS.openrouterModel || 'qwen/qwen3-coder:free'}" placeholder="e.g. qwen/qwen3-coder:free" style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #4CAF50;
                        border-radius: 6px;
                        background: #1a2a1a;
                        color: #4CAF50;
                        font-size: 15px;
                        box-sizing: border-box;
                        font-family: monospace;
                    ">
                    <div style="color: #555; font-size: 14px; margin-top: 3px;">Type any model ID directly. Changes auto-save.</div>
                </div>

                <!-- Search + Refresh row -->
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="orModelSearch" placeholder="Search dropdown (e.g., gemini, claude, free)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="orRefreshModels" title="Refresh models from OpenRouter API" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>

                <!-- Model dropdown -->
                <select id="openrouterModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #ffffff;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="">Loading models...</option>
                </select>
                <div id="orModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>

                <!-- Filter checkboxes -->
                <div style="display: flex; gap: 12px; margin-top: 6px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: #888; font-size: 14px; cursor: pointer;">
                        <input type="checkbox" id="orShowFreeOnly" style="margin: 0;">
                        Free only
                    </label>
                </div>
            `;

            setTimeout(() => {
                const select = document.getElementById('openrouterModel');
                const customInput = document.getElementById('orCustomModel');
                const searchInput = document.getElementById('orModelSearch');
                const refreshBtn = document.getElementById('orRefreshModels');
                const statusDiv = document.getElementById('orModelStatus');
                const freeOnlyCheckbox = document.getElementById('orShowFreeOnly');

                let allModels = [];
                let showFreeOnly = false;

                // Save model from custom input (takes priority)
                const saveCustomModel = (value) => {
                    const trimmed = (value || '').trim();
                    if (trimmed) {
                        SETTINGS.openrouterModel = trimmed;
                        saveSettings(SETTINGS);
                    }
                };

                if (customInput) {
                    // Debounced save on typing
                    let customSaveTimeout;
                    customInput.addEventListener('input', () => {
                        clearTimeout(customSaveTimeout);
                        customSaveTimeout = setTimeout(() => {
                            saveCustomModel(customInput.value);
                            // Sync dropdown selection if the typed ID matches a known model
                            if (select) {
                                const found = Array.from(select.options).find(o => o.value === customInput.value.trim());
                                if (found) select.value = found.value;
                            }
                        }, 400);
                    });
                }

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.openrouterModel || 'qwen/qwen3-coder:free';
                    select.innerHTML = '';

                    // Group models
                    const { freeModels, groups } = OpenRouterProvider.groupModels(models);

                    // Add free models first
                    if (freeModels.length > 0) {
                        const freeGroup = document.createElement('optgroup');
                        freeGroup.label = `⭐ Free Models (${freeModels.length})`;
                        freeModels.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = `${model.name} (${model.author})`;
                            option.title = model.description || '';
                            option.selected = model.id === currentValue;
                            freeGroup.appendChild(option);
                        });
                        select.appendChild(freeGroup);
                    }

                    // Add other groups (skip if showing free only)
                    if (!showFreeOnly) {
                        const sortedGroups = Object.keys(groups).sort();
                        for (const groupName of sortedGroups) {
                            const groupModels = groups[groupName];
                            if (groupModels.length === 0) continue;

                            const optgroup = document.createElement('optgroup');
                            optgroup.label = `${groupName} (${groupModels.length})`;
                            groupModels.forEach(model => {
                                const option = document.createElement('option');
                                option.value = model.id;
                                option.textContent = `${model.name} (${model.author})`;
                                option.title = model.description || '';
                                option.selected = model.id === currentValue;
                                optgroup.appendChild(option);
                            });
                            select.appendChild(optgroup);
                        }
                    }

                    const totalCount = showFreeOnly ? freeModels.length : models.length;
                    if (statusDiv) statusDiv.textContent = `${totalCount} models loaded`;
                };

                const applyFilters = () => {
                    let filtered = allModels;
                    const searchQuery = searchInput?.value?.trim() || '';
                    if (searchQuery) {
                        filtered = OpenRouterProvider.filterModels(filtered, searchQuery);
                    }
                    if (showFreeOnly) {
                        filtered = filtered.filter(m => m.isFree);
                    }
                    populateSelect(filtered);
                };

                const loadModels = async (forceRefresh = false) => {
                    if (statusDiv) statusDiv.textContent = 'Loading models from OpenRouter...';
                    if (refreshBtn) {
                        refreshBtn.disabled = true;
                        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
                    }

                    try {
                        allModels = await OpenRouterProvider.fetchModels(forceRefresh);
                        applyFilters();
                        if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                    } catch (error) {
                        console.error('[OpenRouter] Failed to load models:', error);
                        if (statusDiv) statusDiv.textContent = `Error loading: ${error.message}`;
                        select.innerHTML = '<option value="qwen/qwen3-coder:free" selected>Qwen3 Coder Free (Default)</option>';
                    } finally {
                        if (refreshBtn) {
                            refreshBtn.disabled = false;
                            refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
                        }
                    }
                };

                if (searchInput) {
                    let searchTimeout;
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(applyFilters, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (freeOnlyCheckbox) {
                    freeOnlyCheckbox.addEventListener('change', () => {
                        showFreeOnly = freeOnlyCheckbox.checked;
                        applyFilters();
                    });
                }

                if (select) {
                    // When user picks from dropdown, sync to the custom input and save
                    select.addEventListener('change', () => {
                        const val = select.value;
                        if (val && customInput) customInput.value = val;
                        SETTINGS.openrouterModel = val;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };

        panelContent.appendChild(createOpenRouterModelSelector());
        // ========================================================

        // ========== PUTER.JS MODEL SELECTOR (NO API KEY) ==========
        const createPuterModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'puter-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'puter' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">Puter.js Model</div>
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="puterModelSearch" placeholder="Search models (e.g., gemini, claude, gpt)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="puterRefreshModels" title="Reset models list" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>
                <select id="puterModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #ffffff;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="gpt-5.4-nano">Loading models...</option>
                </select>
                <div id="puterModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
                <div style="display: flex; gap: 6px; margin-top: 6px;">
                    <input type="text" id="puterCustomModel" placeholder="Custom model (e.g., qwen/qwen3-coder:free)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="puterApplyCustomModel" title="Use custom model" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    ">Use</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 4px; color: #888; font-size: 14px; cursor: pointer;">
                        <input type="checkbox" id="puterEnableReasoning" style="margin: 0;">
                        Enable reasoning
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; color: #888; font-size: 14px; cursor: pointer;">
                        <span>Effort</span>
                        <select id="puterReasoningEffort" style="
                            padding: 4px 6px;
                            border: 1px solid #444;
                            border-radius: 4px;
                            background: #2d2d2d;
                            color: #fff;
                            font-size: 14px;
                        ">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </label>
                </div>
                <div style="color: #888; font-size: 14px; margin-top: 4px; line-height: 1.4;">
                    No API key required. Uses your Puter account and supports short aliases plus full model IDs.
                </div>
            `;

            setTimeout(() => {
                const select = document.getElementById('puterModel');
                const searchInput = document.getElementById('puterModelSearch');
                const refreshBtn = document.getElementById('puterRefreshModels');
                const statusDiv = document.getElementById('puterModelStatus');
                const customModelInput = document.getElementById('puterCustomModel');
                const customModelBtn = document.getElementById('puterApplyCustomModel');
                const reasoningToggle = document.getElementById('puterEnableReasoning');
                const reasoningEffortSelect = document.getElementById('puterReasoningEffort');

                let allModels = PuterProvider.getModels();

                if (reasoningToggle) reasoningToggle.checked = Boolean(SETTINGS.puterEnableReasoning);
                if (reasoningEffortSelect) reasoningEffortSelect.value = SETTINGS.puterReasoningEffort || 'low';

                const populateSelect = (models) => {
                    if (!select) return;
                    const customValue = (SETTINGS.puterCustomModel || '').trim();
                    const currentValue = customValue || SETTINGS.puterModel || PuterProvider.CONFIG.DEFAULT_MODEL;
                    select.innerHTML = '';

                    if (customValue) {
                        const customOption = document.createElement('option');
                        customOption.value = customValue;
                        customOption.textContent = `Custom: ${customValue}`;
                        customOption.selected = true;
                        select.appendChild(customOption);
                    }

                    const groups = PuterProvider.groupModels(models);
                    const sortedGroups = Object.keys(groups).sort((a, b) => a.localeCompare(b));

                    for (const groupName of sortedGroups) {
                        const groupModels = groups[groupName];
                        if (!groupModels || groupModels.length === 0) continue;

                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${groupName} (${groupModels.length})`;
                        groupModels.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = model.name;
                            option.title = model.description || '';
                            option.selected = model.id === currentValue;
                            optgroup.appendChild(option);
                        });
                        select.appendChild(optgroup);
                    }

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = () => {
                    allModels = PuterProvider.getModels();
                    populateSelect(allModels);
                    if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                };

                if (customModelInput) {
                    customModelInput.value = SETTINGS.puterCustomModel || '';
                }

                if (searchInput) {
                    let searchTimeout;
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            const filtered = PuterProvider.filterModels(allModels, searchInput.value.trim());
                            populateSelect(filtered);
                        }, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => {
                        if (searchInput) searchInput.value = '';
                        loadModels();
                    });
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.puterModel = select.value;
                        if ((SETTINGS.puterCustomModel || '').trim()) {
                            SETTINGS.puterCustomModel = '';
                            if (customModelInput) customModelInput.value = '';
                        }
                        saveSettings(SETTINGS);
                    });
                }

                const applyCustomModel = () => {
                    const value = (customModelInput?.value || '').trim();
                    if (!value) return;
                    SETTINGS.puterCustomModel = value;
                    SETTINGS.puterModel = value;
                    saveSettings(SETTINGS);
                    populateSelect(allModels);
                };

                if (customModelBtn) {
                    customModelBtn.addEventListener('click', applyCustomModel);
                }

                if (customModelInput) {
                    customModelInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            applyCustomModel();
                        }
                    });
                }

                if (reasoningToggle) {
                    reasoningToggle.addEventListener('change', () => {
                        SETTINGS.puterEnableReasoning = reasoningToggle.checked;
                        saveSettings(SETTINGS);
                    });
                }

                if (reasoningEffortSelect) {
                    reasoningEffortSelect.addEventListener('change', () => {
                        SETTINGS.puterReasoningEffort = reasoningEffortSelect.value;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };

        panelContent.appendChild(createPuterModelSelector());
        // ========================================================

        // ========== G4F API KEY AND MODEL SELECTOR (NEW) ==========
        panelContent.appendChild(createTextInput('g4fApiKey', 'G4F API Key', SETTINGS.g4fApiKey, 'Enter your G4F API key'));
        panelContent.appendChild(createG4FModelSelector());
        // ===========================================================

        // ========== DUCKDUCKGO MODEL SELECTOR (Uses Proxy API) ==========
        const createDuckDuckGoModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'duckduckgo-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'duckduckgo' ? 'block' : 'none'};`;

            const models = DuckDuckGoProvider.getModels();
            const currentModel = SETTINGS.duckduckgoModel || 'gpt-4o-mini';
            const currentApiUrl = SETTINGS.duckduckgoApiUrl || 'https://duckduckgo-api.toontamilindia.workers.dev';
            const currentApiKey = SETTINGS.duckduckgoApiKey || '';
            const currentIncludeReasoning = Boolean(SETTINGS.duckduckgoIncludeReasoning);
            const currentReasoningEffort = (SETTINGS.duckduckgoReasoningEffort || 'low').toLowerCase();

            let optionsHtml = models.map(m =>
                `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.name} (${m.owner})</option>`
            ).join('');

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">🦆 DuckDuckGo AI (Proxy)</div>
                <div style="background: #1a3a1a; border: 1px solid #4CAF50; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                    <div style="color: #4CAF50; font-size: 15px; font-weight: bold;">✨ FREE - Uses Cloudflare Worker Proxy</div>
                    <div style="color: #888; font-size: 14px; margin-top: 4px;">Bypasses CSP restrictions</div>
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">API URL</label>
                    <input type="text" id="ddgApiUrl" value="${currentApiUrl}" placeholder="https://your-worker.workers.dev" style="
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid #444;
                        border-radius: 4px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">API Key (optional)</label>
                    <input type="password" id="ddgApiKey" value="${currentApiKey}" placeholder="Leave empty if not required" style="
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid #444;
                        border-radius: 4px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                </div>
                <div style="margin-bottom: 4px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">Model</label>
                    <select id="ddgModelSelect" style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 16px;
                        box-sizing: border-box;
                    ">
                        ${optionsHtml}
                    </select>
                </div>
                <div style="margin: 8px 0 6px 0; padding: 8px; border: 1px solid #333; border-radius: 6px; background: #232323;">
                    <div style="color: #fff; font-size: 15px; margin-bottom: 6px;">Reasoning (GPT-5 / GPT-OSS / Claude)</div>
                    <label style="display: flex; align-items: center; gap: 8px; color: #aaa; font-size: 15px; margin-bottom: 6px; cursor: pointer;">
                        <input type="checkbox" id="ddgIncludeReasoning" ${currentIncludeReasoning ? 'checked' : ''}>
                        Include reasoning in output
                    </label>
                    <label style="color: #aaa; font-size: 14px; display: block; margin-bottom: 4px;">Reasoning Effort</label>
                    <select id="ddgReasoningEffort" style="
                        width: 100%;
                        padding: 6px;
                        border: 1px solid #444;
                        border-radius: 4px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                        <option value="minimal" ${currentReasoningEffort === 'minimal' ? 'selected' : ''}>Minimal</option>
                        <option value="low" ${currentReasoningEffort === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${currentReasoningEffort === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${currentReasoningEffort === 'high' ? 'selected' : ''}>High</option>
                        <option value="none" ${currentReasoningEffort === 'none' ? 'selected' : ''}>None (omit)</option>
                    </select>
                    <div id="ddgReasoningHint" style="color: #777; font-size: 14px; margin-top: 6px;"></div>
                </div>
            `;

            setTimeout(() => {
                const select = document.getElementById('ddgModelSelect');
                const apiUrlInput = document.getElementById('ddgApiUrl');
                const apiKeyInput = document.getElementById('ddgApiKey');
                const includeReasoningToggle = document.getElementById('ddgIncludeReasoning');
                const reasoningEffortSelect = document.getElementById('ddgReasoningEffort');
                const reasoningHint = document.getElementById('ddgReasoningHint');
                const validReasoningEfforts = new Set(['minimal', 'low', 'medium', 'high', 'none']);

                const updateReasoningControls = () => {
                    const selectedModel = select ? select.value : currentModel;
                    const supportsReasoning = selectedModel === 'gpt-5-mini' || selectedModel === 'gpt-oss-120b' || selectedModel === 'claude-haiku-4-5';
                    const isEnabled = Boolean(includeReasoningToggle && includeReasoningToggle.checked);

                    if (includeReasoningToggle) {
                        includeReasoningToggle.disabled = !supportsReasoning;
                    }
                    if (reasoningEffortSelect) {
                        reasoningEffortSelect.disabled = !supportsReasoning || !isEnabled;
                    }
                    if (reasoningHint) {
                        reasoningHint.textContent = supportsReasoning
                            ? 'Reasoning is requested from the proxy and prepended before the answer.'
                            : 'Reasoning is available only for GPT-5 Mini, GPT-OSS 120B, and Claude Haiku 4.5.';
                    }
                };

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.duckduckgoModel = select.value;
                        saveSettings(SETTINGS);
                        updateReasoningControls();
                    });
                }
                if (apiUrlInput) {
                    apiUrlInput.addEventListener('change', () => {
                        SETTINGS.duckduckgoApiUrl = apiUrlInput.value.trim();
                        saveSettings(SETTINGS);
                    });
                }
                if (apiKeyInput) {
                    apiKeyInput.addEventListener('change', () => {
                        SETTINGS.duckduckgoApiKey = apiKeyInput.value;
                        saveSettings(SETTINGS);
                    });
                }
                if (includeReasoningToggle) {
                    includeReasoningToggle.addEventListener('change', () => {
                        SETTINGS.duckduckgoIncludeReasoning = includeReasoningToggle.checked;
                        saveSettings(SETTINGS);
                        updateReasoningControls();
                    });
                }
                if (reasoningEffortSelect) {
                    reasoningEffortSelect.addEventListener('change', () => {
                        const effort = (reasoningEffortSelect.value || 'low').toLowerCase();
                        SETTINGS.duckduckgoReasoningEffort = validReasoningEfforts.has(effort) ? effort : 'low';
                        saveSettings(SETTINGS);
                    });
                }

                updateReasoningControls();
            }, 100);

            return wrapper;
        };
        panelContent.appendChild(createDuckDuckGoModelSelector());
        // ==============================================================

        // ========== YUPPBRIDGE MODEL SELECTOR (200+ Models) ==========
        const createYuppBridgeModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'yuppbridge-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'yuppbridge' ? 'block' : 'none'};`;

            const currentApiUrl = SETTINGS.yuppbridgeApiUrl || '';
            const currentApiKey = SETTINGS.yuppbridgeApiKey || '';
            const currentModel = SETTINGS.yuppbridgeModel || 'gpt-4o';

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="#3b82f6" style="display:inline-block;vertical-align:middle;margin-right:5px"><path d="M4 13h16v-2H4v2zm-2 4h20v-2H2v2zM2 7v2h20V7H2z"/></svg>YuppBridge (200+ Models)</div>
                <div style="background: #1a2a3a; border: 1px solid #2196F3; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                    <div style="color: #2196F3; font-size: 15px; font-weight: bold;"><svg viewBox="0 0 24 24" width="12" height="12" fill="#3b82f6" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>Self-hosted Yupp AI Proxy</div>
                    <div style="color: #888; font-size: 14px; margin-top: 4px;">OpenAI-compatible API with 200+ models</div>
                    <div style="color: #666; font-size: 13px; margin-top: 2px;">
                        <a href="https://github.com/cloudWaddie/yuppbridge" target="_blank" style="color:#64B5F6;">Self-host Guide</a>
                    </div>
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">API URL <span style="color:#f44336;">*</span></label>
                    <input type="text" id="yuppbridgeApiUrl" value="${currentApiUrl}" placeholder="https://your-yuppbridge-instance.com" style="
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid #444;
                        border-radius: 4px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">API Key <span style="color:#f44336;">*</span></label>
                    <input type="password" id="yuppbridgeApiKey" value="${currentApiKey}" placeholder="Your YuppBridge API key" style="
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid #444;
                        border-radius: 4px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                </div>
                <div style="margin-bottom: 6px;">
                    <label style="color: #aaa; font-size: 15px; display: block; margin-bottom: 4px;">Model</label>
                    <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                        <input type="text" id="yuppbridgeModelSearch" placeholder="Search models (e.g., gpt-4, claude, gemini)" style="
                            flex: 1;
                            padding: 6px 8px;
                            border: 1px solid #444;
                            border-radius: 4px;
                            background: #2d2d2d;
                            color: #fff;
                            font-size: 15px;
                            box-sizing: border-box;
                        ">
                        <button id="yuppbridgeRefreshModels" title="Refresh models list" style="
                            padding: 6px 10px;
                            border: 1px solid #444;
                            border-radius: 4px;
                            background: #3d3d3d;
                            color: #fff;
                            cursor: pointer;
                            font-size: 15px;
                        "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                        <button id="yuppbridgeHealthCheck" title="Check API health" style="
                            padding: 6px 10px;
                            border: 1px solid #444;
                            border-radius: 4px;
                            background: #3d3d3d;
                            color: #fff;
                            cursor: pointer;
                            font-size: 15px;
                        "><svg viewBox="0 0 24 24" width="13" height="13" fill="#ef4444" style="display:block;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
                    </div>
                    <select id="yuppbridgeModelSelect" style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                        <option value="${currentModel}">${currentModel}</option>
                    </select>
                    <div id="yuppbridgeModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
                </div>
            `;

            setTimeout(() => {
                const select = document.getElementById('yuppbridgeModelSelect');
                const apiUrlInput = document.getElementById('yuppbridgeApiUrl');
                const apiKeyInput = document.getElementById('yuppbridgeApiKey');
                const searchInput = document.getElementById('yuppbridgeModelSearch');
                const refreshBtn = document.getElementById('yuppbridgeRefreshModels');
                const healthBtn = document.getElementById('yuppbridgeHealthCheck');
                const statusDiv = document.getElementById('yuppbridgeModelStatus');

                let allModels = [];

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.yuppbridgeModel || 'gpt-4o';
                    select.innerHTML = '';

                    // Group models by category
                    const groups = YuppBridgeProvider.groupModels(models);
                    const categoryOrder = ['GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Claude', 'Gemini', 'Llama', 'Mistral', 'DeepSeek', 'Qwen', 'Other'];

                    for (const category of categoryOrder) {
                        const categoryModels = groups[category];
                        if (!categoryModels || categoryModels.length === 0) continue;

                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${category} (${categoryModels.length})`;
                        categoryModels.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = `${model.name} (${model.ownedBy})`;
                            option.selected = model.id === currentValue;
                            optgroup.appendChild(option);
                        });
                        select.appendChild(optgroup);
                    }

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = async (forceRefresh = false) => {
                    if (!SETTINGS.yuppbridgeApiUrl) {
                        if (statusDiv) statusDiv.textContent = 'Enter API URL to load models';
                        return;
                    }

                    if (statusDiv) statusDiv.textContent = 'Loading models...';
                    if (refreshBtn) {
                        refreshBtn.disabled = true;
                        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
                    }

                    try {
                        allModels = await YuppBridgeProvider.fetchModels(forceRefresh);
                        populateSelect(allModels);
                        if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                    } catch (error) {
                        console.error('[YuppBridge] Failed to load models:', error);
                        if (statusDiv) statusDiv.textContent = `Error: ${error.message}`;
                    } finally {
                        if (refreshBtn) {
                            refreshBtn.disabled = false;
                            refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
                        }
                    }
                };

                if (apiUrlInput) {
                    apiUrlInput.addEventListener('change', () => {
                        SETTINGS.yuppbridgeApiUrl = apiUrlInput.value.trim();
                        saveSettings(SETTINGS);
                        console.log('[YuppBridge] API URL updated:', SETTINGS.yuppbridgeApiUrl);
                        loadModels(true);
                    });
                    // Also capture on blur for better UX
                    apiUrlInput.addEventListener('blur', () => {
                        if (apiUrlInput.value.trim() !== SETTINGS.yuppbridgeApiUrl) {
                            SETTINGS.yuppbridgeApiUrl = apiUrlInput.value.trim();
                            saveSettings(SETTINGS);
                            console.log('[YuppBridge] API URL updated (blur):', SETTINGS.yuppbridgeApiUrl);
                            loadModels(true);
                        }
                    });
                }

                if (apiKeyInput) {
                    apiKeyInput.addEventListener('change', () => {
                        SETTINGS.yuppbridgeApiKey = apiKeyInput.value;
                        saveSettings(SETTINGS);
                        console.log('[YuppBridge] API Key updated, length:', SETTINGS.yuppbridgeApiKey.length);
                        // Clear cache and reload models with new API key
                        YuppBridgeProvider.clearCache();
                        loadModels(true);
                    });
                    // Also capture on blur
                    apiKeyInput.addEventListener('blur', () => {
                        if (apiKeyInput.value !== SETTINGS.yuppbridgeApiKey) {
                            SETTINGS.yuppbridgeApiKey = apiKeyInput.value;
                            saveSettings(SETTINGS);
                            console.log('[YuppBridge] API Key updated (blur), length:', SETTINGS.yuppbridgeApiKey.length);
                            YuppBridgeProvider.clearCache();
                            loadModels(true);
                        }
                    });
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.yuppbridgeModel = select.value;
                        saveSettings(SETTINGS);
                    });
                }

                if (searchInput) {
                    let searchTimeout;
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            const filtered = YuppBridgeProvider.filterModels(allModels, searchInput.value.trim());
                            populateSelect(filtered);
                        }, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (healthBtn) {
                    healthBtn.addEventListener('click', async () => {
                        if (statusDiv) statusDiv.textContent = 'Checking health...';
                        healthBtn.disabled = true;
                        healthBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';

                        const result = await YuppBridgeProvider.checkHealth();

                        if (result.ok) {
                            if (statusDiv) {
                                const uptime = result.data?.uptime ? ` (uptime: ${Math.floor(result.data.uptime)}s)` : '';
                                statusDiv.innerHTML = `<span style="color:#4CAF50;">✓ API is healthy${uptime}</span>`;
                            }
                        } else {
                            if (statusDiv) statusDiv.innerHTML = `<span style="color:#f44336;">✗ ${result.error}</span>`;
                        }

                        healthBtn.disabled = false;
                        healthBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="#ef4444" style="display:block"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
                    });
                }

                // Load models on init if API URL is set
                if (SETTINGS.yuppbridgeApiUrl) {
                    loadModels();
                }
            }, 100);

            return wrapper;
        };
        panelContent.appendChild(createYuppBridgeModelSelector());
        // ==============================================================

        const note = document.createElement('div');
        note.style.cssText = 'color:#3f3f46;font-size:14px;padding:14px 4px;text-align:center;font-family:"VT323",monospace;line-height:1.7;border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;';
        note.innerHTML = 'Reload page after changing settings<br>Keys: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#4CAF50;">Gemini</a> | <a href="https://openrouter.ai/keys" target="_blank" style="color:#4CAF50;">OpenRouter</a> | <a href="https://g4f.space" target="_blank" style="color:#4CAF50;">G4F</a><br>Puter.js: no API key required | <a href="https://developer.puter.com/ai/" target="_blank" style="color:#2196F3;">Puter AI docs</a><br>DuckDuckGo AI is FREE! | <a href="https://github.com/cloudWaddie/yuppbridge" target="_blank" style="color:#2196F3;">YuppBridge</a>';
        panelContent.appendChild(note);

        panel.appendChild(panelHeader);
        panel.appendChild(panelContent);

        settingsBtn.addEventListener('click', () => {
            if (panel.style.display === 'none' || !panel.style.display) {
                panel.style.display = 'block';
                panel.style.animation = 'bypassSlideIn 0.28s cubic-bezier(.34,1.56,.64,1) forwards';
            } else {
                panel.style.animation = '';
                panel.style.display = 'none';
            }
        });

        // Close panel when clicking outside
        // NOTE: use settingsBtn.contains() — not strict equality — so clicking
        // the child <img> (or any future child element) is treated as "on the button".
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !settingsBtn.contains(e.target)) {
                panel.style.display = 'none';
            }
        });

        // Add to page when DOM is ready
        const addToPage = () => {
            document.body.appendChild(settingsBtn);
            document.body.appendChild(panel);
        };

        if (document.body) {
            addToPage();
        } else {
            document.addEventListener('DOMContentLoaded', addToPage);
        }
    };

    // Create settings UI after a delay to ensure page is loaded AND script is enabled
    onScriptEnabled(() => {
        setTimeout(createSettingsUI, 500);
    });

    // Store original functions
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRequestFullscreen = Element.prototype.requestFullscreen;
    const originalExitFullscreen = document.exitFullscreen;
    const originalClipboardWrite = navigator.clipboard?.writeText;
    const originalClipboardRead = navigator.clipboard?.readText;

    // ============================================
    // PRE-EMPTIVE ACE EDITOR INTERCEPTION
    // This runs BEFORE ACE loads to intercept blocking attempts
    // ============================================

    if (SETTINGS.bypassCopyPaste) {

        // Store reference to intercept ace.edit when it's created
        let aceIntercepted = false;
        const interceptAce = () => {
            if (aceIntercepted || !window.ace) return;

            const originalEdit = window.ace.edit;
            window.ace.edit = function (...args) {
                const editor = originalEdit.apply(this, args);

                if (editor && editor.commands) {
                    // Intercept addCommand to block 'bte' and similar
                    const originalAddCommand = editor.commands.addCommand.bind(editor.commands);
                    editor.commands.addCommand = function (command) {
                        // Block commands that disable clipboard shortcuts
                        if (command && command.name === 'bte') {
                            console.log('Blocked ACE bte command registration');
                            return;
                        }
                        if (command && command.bindKey) {
                            const bindKey = typeof command.bindKey === 'string'
                                ? command.bindKey
                                : (command.bindKey.win || command.bindKey.mac || '');
                            if (bindKey.includes('ctrl-c') || bindKey.includes('ctrl-v') ||
                                bindKey.includes('ctrl-x') || bindKey.includes('cmd-c') ||
                                bindKey.includes('cmd-v') || bindKey.includes('cmd-x')) {
                                if (command.exec && command.exec.toString().includes('function() {}')) {
                                    console.log('Blocked empty clipboard command:', command.name);
                                    return;
                                }
                            }
                        }
                        return originalAddCommand(command);
                    };

                    // Intercept commands.on to block paste-blocking exec handlers
                    const originalCommandsOn = editor.commands.on.bind(editor.commands);
                    editor.commands.on = function (event, callback) {
                        if (event === 'exec' && callback) {
                            const cbStr = callback.toString();
                            if (cbStr.includes('paste') && cbStr.includes('preventDefault')) {
                                console.log('Blocked ACE exec paste-blocking handler');
                                return;
                            }
                        }
                        return originalCommandsOn(event, callback);
                    };

                    // Intercept session.on('change') for anti-bulk-paste bypass
                    if (editor.session) {
                        const originalSessionOn = editor.session.on.bind(editor.session);
                        editor.session.on = function (event, callback) {
                            if (event === 'change' && callback) {
                                const cbStr = callback.toString();
                                // Block the 30-char diff detection handler
                                if (cbStr.includes('diff > 30') || cbStr.includes('diff>30')) {
                                    console.log('Blocked ACE 30-char anti-paste change handler');
                                    // Replace with a simple sync handler that always syncs
                                    return originalSessionOn(event, function (e) {
                                        const $ = window.jQuery || window.$;
                                        if ($ && $("#txtCode").length) {
                                            $("#txtCode").val(editor.getSession().getValue());
                                        }
                                    });
                                }
                            }
                            return originalSessionOn(event, callback);
                        };

                        // Also add our own change handler to ensure sync always happens
                        editor.session.on('change', function (e) {
                            const $ = window.jQuery || window.$;
                            if ($ && $("#txtCode").length) {
                                $("#txtCode").val(editor.getSession().getValue());
                            }
                        });
                    }
                }

                return editor;
            };

            aceIntercepted = true;
            console.log('ACE editor intercepted');
        };

        // Watch for ace to be defined
        let aceInstance = window.ace;
        if (aceInstance) {
            setTimeout(interceptAce, 0);
        }

        try {
            Object.defineProperty(window, 'ace', {
                configurable: true,
                set: function (value) {
                    aceInstance = value;
                    interceptAce();
                },
                get: function () {
                    return aceInstance;
                }
            });
        } catch (e) {
            console.error('Failed to define window.ace property', e);
        }

        // Also check periodically in case ace is already loaded
        const aceCheck = setInterval(() => {
            if (window.ace && !aceIntercepted) {
                interceptAce();
                clearInterval(aceCheck);
            }
        }, 50);
        setTimeout(() => clearInterval(aceCheck), 10000);

        // ============================================
        // KEYBOARD EVENT INTERCEPTION (for Ctrl+V in ACE)
        // ============================================

        // Intercept keydown at the highest priority to ensure Ctrl+V works
        window.addEventListener('keydown', function (e) {
            // Handle Ctrl+V / Cmd+V
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                const activeEl = document.activeElement;
                const aceContainer = activeEl?.closest('.ace_editor');

                if (aceContainer && aceContainer.env?.editor) {
                    e.stopImmediatePropagation();
                    // Don't preventDefault - allow the native paste event to fire

                    const editor = aceContainer.env.editor;

                    // Try Clipboard API first (works if permissions granted)
                    // Fall back to native paste event handling
                    if (navigator.clipboard && navigator.clipboard.readText) {
                        navigator.clipboard.readText().then(text => {
                            if (text) {
                                const session = editor.getSession();
                                const $ = window.jQuery || window.$;

                                // Insert text directly
                                session.insert(editor.getCursorPosition(), text);

                                // Sync with hidden textarea immediately
                                if ($ && $("#txtCode").length) {
                                    $("#txtCode").val(session.getValue());
                                }
                            }
                        }).catch(err => {
                            // Clipboard API failed - this is expected without permissions
                            // The native paste event should still work through ACE's built-in handling
                            console.log('Clipboard API not available, using native paste');
                        });
                    }
                }
            }

            // Handle Ctrl+C / Cmd+C
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const activeEl = document.activeElement;
                const aceContainer = activeEl?.closest('.ace_editor');

                if (aceContainer && aceContainer.env?.editor) {
                    e.stopImmediatePropagation();

                    const editor = aceContainer.env.editor;
                    const text = editor.getCopyText();

                    if (text && navigator.clipboard) {
                        navigator.clipboard.writeText(text);
                    }
                }
            }

            // Handle Ctrl+X / Cmd+X
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                const activeEl = document.activeElement;
                const aceContainer = activeEl?.closest('.ace_editor');

                if (aceContainer && aceContainer.env?.editor) {
                    e.stopImmediatePropagation();

                    const editor = aceContainer.env.editor;
                    const text = editor.getCopyText();

                    if (text && navigator.clipboard) {
                        navigator.clipboard.writeText(text);
                        editor.session.remove(editor.getSelectionRange());
                    }
                }
            }

            // Handle Ctrl+Z / Cmd+Z (Undo)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                const activeEl = document.activeElement;
                const aceContainer = activeEl?.closest('.ace_editor');

                if (aceContainer && aceContainer.env?.editor) {
                    e.stopImmediatePropagation();
                    aceContainer.env.editor.undo();
                }
            }
        }, true); // Capture phase - runs first
    } // End of SETTINGS.bypassCopyPaste block for keyboard interception

    // 2.6 FULL SCREEN COPY MODE (Ctrl+A)
    window.addEventListener('keydown', function (e) {
        if (!SETTINGS.enableFullScreenCopyMode) return;
        const key = (e.key || '').toLowerCase();
        if (!(e.ctrlKey || e.metaKey) || key !== 'a') return;

        const activeEl = document.activeElement;
        const isEditable = activeEl && (
            activeEl.isContentEditable ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'file'].includes(activeEl.type))
        );

        if (isEditable) return; // Allow normal select-all in inputs/editors

        e.preventDefault();
        e.stopImmediatePropagation();

        const pageText = (document.body?.innerText || '').trim();
        const payload = `${pageText}${FULLSCREEN_COPY_PROMPT}`.trim();

        const fallbackCopy = (text) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '-1000px';
            textarea.style.left = '-1000px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.warn('Fallback copy failed:', err);
            }
            document.body.removeChild(textarea);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(payload).catch(() => fallbackCopy(payload));
        } else {
            fallbackCopy(payload);
        }
    }, true);

    // 1. BLOCK TAB SWITCH DETECTION (Page Visibility API)
    if (SETTINGS.bypassTabDetection) {
        Object.defineProperty(document, 'visibilityState', {
            get: function () {
                return 'visible'; // Always report as visible
            },
            configurable: true
        });

        Object.defineProperty(document, 'hidden', {
            get: function () {
                return false; // Always report as not hidden
            },
            configurable: true
        });

        // Override addEventListener to block visibilitychange events
        // But allow other events to pass through normally
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (type === 'visibilitychange' || type === 'webkitvisibilitychange') {
                console.log('Blocked visibilitychange event listener');
                return; // Don't add the listener
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    // 2. ENABLE COPY/PASTE FUNCTIONALITY
    if (SETTINGS.bypassCopyPaste) {
        // Block ALL clipboard event prevention by stopping propagation
        // This prevents jQuery's document-level handlers from blocking copy/paste
        const blockClipboardPrevention = (e) => {
            e.stopImmediatePropagation();
            e.stopPropagation();
            // Do NOT call preventDefault - let the native action happen
        };

        // Capture phase listeners run BEFORE bubbling phase (where jQuery binds)
        // Use original addEventListener to avoid our own blocking
        // Apply to ALL elements, not just ACE editor, to enable copying question text
        originalAddEventListener.call(document, 'copy', blockClipboardPrevention, true);
        originalAddEventListener.call(document, 'cut', blockClipboardPrevention, true);
        originalAddEventListener.call(document, 'paste', blockClipboardPrevention, true);

        // Handle native paste event for ACE editor (fallback when Clipboard API is blocked)
        originalAddEventListener.call(document, 'paste', function (e) {
            const activeEl = document.activeElement;
            const aceContainer = activeEl?.closest('.ace_editor');

            if (aceContainer && aceContainer.env?.editor && e.clipboardData) {
                const text = e.clipboardData.getData('text/plain');
                if (text) {
                    e.preventDefault();
                    const editor = aceContainer.env.editor;
                    const session = editor.getSession();
                    const $ = window.jQuery || window.$;

                    // Insert text directly
                    session.insert(editor.getCursorPosition(), text);

                    // Sync with hidden textarea
                    if ($ && $("#txtCode").length) {
                        $("#txtCode").val(session.getValue());
                    }
                }
            }
        }, false);

        // Also intercept at window level
        originalAddEventListener.call(window, 'copy', blockClipboardPrevention, true);
        originalAddEventListener.call(window, 'cut', blockClipboardPrevention, true);
        originalAddEventListener.call(window, 'paste', blockClipboardPrevention, true);

        // Override jQuery's bind/on methods to ignore clipboard events
        // BUT preserve PrimeFaces functionality
        const waitForJQuery = setInterval(() => {
            if (window.jQuery || window.$) {
                const jq = window.jQuery || window.$;
                const originalBind = jq.fn.bind;
                const originalOn = jq.fn.on;

                const filterClipboardEvents = function (events) {
                    if (typeof events === 'string') {
                        // Only filter direct clipboard events, not namespaced ones from PrimeFaces
                        const eventList = events.split(/\s+/);
                        const filtered = eventList.filter(e => {
                            const baseEvent = e.split('.')[0];
                            // Only block if it's a simple cut/copy/paste without namespace
                            // This preserves PrimeFaces events like 'change.primefaces'
                            return !['cut', 'copy', 'paste'].includes(baseEvent) || e.includes('.');
                        });
                        return filtered.join(' ');
                    }
                    return events;
                };

                jq.fn.bind = function (events, ...args) {
                    if (typeof events === 'string' && ['cut', 'copy', 'paste'].some(e => events === e)) {
                        return this; // Only block exact matches
                    }
                    return originalBind.call(this, events, ...args);
                };

                jq.fn.on = function (events, ...args) {
                    if (typeof events === 'string' && ['cut', 'copy', 'paste'].some(e => events === e)) {
                        return this; // Only block exact matches
                    }
                    return originalOn.call(this, events, ...args);
                };

                console.log('jQuery clipboard event binding intercepted');
                clearInterval(waitForJQuery);
            }
        }, 10);

        // Stop checking after 5 seconds
        setTimeout(() => clearInterval(waitForJQuery), 5000);

        // Restore clipboard API if available
        if (navigator.clipboard) {
            if (originalClipboardWrite) {
                navigator.clipboard.writeText = originalClipboardWrite;
            }
            if (originalClipboardRead) {
                navigator.clipboard.readText = originalClipboardRead;
            }
        }
    } // End of SETTINGS.bypassCopyPaste block

    // 2.1 REMOVE DRAG & DROP RESTRICTIONS
    if (SETTINGS.enableDragDrop) {
        // Remove inline event handlers from body when DOM is ready
        const removeDragRestrictions = () => {
            document.body?.removeAttribute('ondragstart');
            document.body?.removeAttribute('ondrop');
            document.body?.removeAttribute('onselectstart');
            document.body?.removeAttribute('oncontextmenu');

            // Also remove from all elements that might have these
            document.querySelectorAll('[ondragstart], [ondrop], [onselectstart]').forEach(el => {
                el.removeAttribute('ondragstart');
                el.removeAttribute('ondrop');
                el.removeAttribute('onselectstart');
            });
        };

        // Run when DOM is ready and also after a delay for dynamic content
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', removeDragRestrictions);
        } else {
            removeDragRestrictions();
        }
        setTimeout(removeDragRestrictions, 1000);
        setTimeout(removeDragRestrictions, 3000);
    }

    // 2.2 ENABLE TEXT SELECTION (often disabled via CSS or JS)
    if (SETTINGS.enableTextSelection) {
        const enableSelection = () => {
            const style = document.createElement('style');
            style.textContent = `
                *, *::before, *::after {
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                    -ms-user-select: text !important;
                    user-select: text !important;
                }
                body {
                    -webkit-touch-callout: default !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enableSelection);
        } else {
            enableSelection();
        }

        // 2.3 BLOCK SELECTSTART EVENT PREVENTION
        document.addEventListener('selectstart', (e) => {
            e.stopImmediatePropagation();
        }, true);
    } // End of SETTINGS.enableTextSelection

    // 2.4 RESTORE CONTEXT MENU (right-click)
    if (SETTINGS.enableContextMenu) {
        document.addEventListener('contextmenu', (e) => {
            e.stopImmediatePropagation();
        }, true);
    }

    // 2.5 ACE EDITOR BYPASS - Handle all ACE-specific restrictions (post-load cleanup)
    const bypassAceEditor = () => {
        if (!SETTINGS.bypassCopyPaste) return;

        // Find ACE editor instances (txtCode or any ace editor)
        const aceEditors = [];

        // Check for txtCode specifically (SkillRack uses this)
        if (window.txtCode && window.txtCode.commands) {
            aceEditors.push(window.txtCode);
        }

        // Check other common variable names for ACE editors
        const editorNames = ['editor', 'aceEditor', 'codeEditor'];
        editorNames.forEach(name => {
            if (window[name] && window[name].commands && !aceEditors.includes(window[name])) {
                aceEditors.push(window[name]);
            }
        });

        // Also find via ace.edit instances
        if (window.ace) {
            document.querySelectorAll('.ace_editor').forEach(el => {
                if (el.env && el.env.editor && !aceEditors.includes(el.env.editor)) {
                    aceEditors.push(el.env.editor);
                }
            });
        }

        aceEditors.forEach(editor => {
            // Skip if already bypassed
            if (editor._bypassApplied) return;
            editor._bypassApplied = true;

            console.log('Found ACE editor, applying post-load bypass...');

            // 2.5.1 Remove the 'bte' command that blocks ctrl-c/v/x/z
            if (editor.commands) {
                // Remove specific blocking commands
                const blockedCommands = ['bte', 'null', 'blockPaste', 'blockCopy', 'blockCut'];
                blockedCommands.forEach(cmd => {
                    try {
                        editor.commands.removeCommand(cmd, true);
                    } catch (e) { }
                });

                // Also remove any command with empty exec that binds to clipboard keys
                if (editor.commands.commands) {
                    Object.keys(editor.commands.commands).forEach(cmdName => {
                        const cmd = editor.commands.commands[cmdName];
                        if (cmd && cmd.exec) {
                            const execStr = cmd.exec.toString();
                            if (execStr === 'function() {}' || execStr === 'function () {}') {
                                const bindKey = typeof cmd.bindKey === 'string'
                                    ? cmd.bindKey
                                    : (cmd.bindKey?.win || cmd.bindKey?.mac || '');
                                if (bindKey.includes('ctrl-c') || bindKey.includes('ctrl-v') ||
                                    bindKey.includes('ctrl-x') || bindKey.includes('ctrl-z')) {
                                    console.log('Removing empty command:', cmdName);
                                    try {
                                        editor.commands.removeCommand(cmdName, true);
                                    } catch (e) { }
                                }
                            }
                        }
                    });
                }

                // 2.5.2 Remove exec event listeners that block paste
                if (editor.commands._eventRegistry && editor.commands._eventRegistry.exec) {
                    const originalExecHandlers = editor.commands._eventRegistry.exec;
                    editor.commands._eventRegistry.exec = originalExecHandlers.filter(handler => {
                        const handlerStr = handler.toString();
                        if (handlerStr.includes('paste') && handlerStr.includes('preventDefault')) {
                            console.log('Removed paste-blocking exec handler');
                            return false;
                        }
                        return true;
                    });
                }
            }

            // 2.5.3 Remove change event listeners that do 30-char detection
            if (editor.session && editor.session._eventRegistry && editor.session._eventRegistry.change) {
                const originalChangeHandlers = editor.session._eventRegistry.change;
                editor.session._eventRegistry.change = originalChangeHandlers.filter(handler => {
                    const handlerStr = handler.toString();
                    if (handlerStr.includes('diff > 30') || handlerStr.includes('diff>30')) {
                        console.log('Removed 30-char anti-paste change handler');
                        return false;
                    }
                    return true;
                });
            }

            // 2.5.4 Override setValue to prevent reset attempts
            if (editor.session && !editor.session._setValueOverridden) {
                editor.session._setValueOverridden = true;
                const originalSetValue = editor.session.setValue.bind(editor.session);
                const originalGetValue = editor.session.getValue.bind(editor.session);

                editor.session.setValue = function (text, cursorPos) {
                    const currentValue = originalGetValue();

                    // If current value is substantial and new value is much shorter, block it
                    // This catches the anti-paste reset
                    if (currentValue.length > 10 && text.length < currentValue.length - 10) {
                        console.log('Blocked setValue reset attempt');
                        return;
                    }

                    return originalSetValue(text, cursorPos);
                };
            }

            // 2.5.5 Enable drop events on ACE container
            if (editor.container) {
                // Use capture phase to intercept before the blocking handler
                editor.container.addEventListener('drop', (e) => {
                    e.stopImmediatePropagation();
                    const text = e.dataTransfer?.getData('text/plain');
                    if (text && editor.session) {
                        editor.session.insert(editor.getCursorPosition(), text);
                        // Sync with hidden textarea
                        const $ = window.jQuery || window.$;
                        if ($ && $("#txtCode").length) {
                            $("#txtCode").val(editor.session.getValue());
                        }
                    }
                }, true);

                editor.container.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }, true);
            }

            console.log('ACE editor bypass applied successfully');
        });

        // Also override the global cs() function if it exists (SkillRack specific)
        if (typeof window.cs === 'function' && !window._csOverridden) {
            window._csOverridden = true;
            const originalCs = window.cs;
            window.cs = function () {
                // Just sync the value, don't do the diff check
                if (window.txtCode && window.jQuery) {
                    const $ = window.jQuery;
                    if ($("#txtCode").length && window.txtCode.getSession) {
                        const val = window.txtCode.getSession().getValue();
                        // Always sync, even if empty (user might have cleared the editor)
                        $("#txtCode").val(val);
                    }
                }
            };
            console.log('Overrode cs() function');
        }

        // Also override oncompile if it exists
        if (typeof window.oncompile === 'function' && !window._oncompileOverridden) {
            window._oncompileOverridden = true;
            const originalOncompile = window.oncompile;
            window.oncompile = function () {
                // Sync the code before compile
                if (window.txtCode && window.jQuery) {
                    const $ = window.jQuery;
                    if ($("#txtCode").length && window.txtCode.getSession) {
                        const val = window.txtCode.getSession().getValue();
                        $("#txtCode").val(val);
                    }
                }
                // Call original if it does something else
                if (originalOncompile) {
                    return originalOncompile.apply(this, arguments);
                }
            };
            console.log('Overrode oncompile() function');
        }
    };

    // Run ACE bypass after page loads and periodically check for new editors
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(bypassAceEditor, 500);
            setTimeout(bypassAceEditor, 1500);
            setTimeout(bypassAceEditor, 3000);
        });
    } else {
        setTimeout(bypassAceEditor, 500);
        setTimeout(bypassAceEditor, 1500);
        setTimeout(bypassAceEditor, 3000);
    }

    // Also watch for dynamically created editors
    const aceObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && (node.classList?.contains('ace_editor') ||
                    node.querySelector?.('.ace_editor'))) {
                    setTimeout(bypassAceEditor, 100);
                }
            });
        });
    });

    if (document.body) {
        aceObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            aceObserver.observe(document.body, { childList: true, subtree: true });
        });
    }

    // 3. BYPASS FULL-SCREEN ENFORCEMENT
    // Store original for document specifically
    const originalDocumentAddEventListener = document.addEventListener.bind(document);

    if (SETTINGS.bypassFullscreen) {
        Element.prototype.requestFullscreen = function () {
            console.log('Full-screen request intercepted');
            // Return a fake promise that resolves immediately
            return Promise.resolve();
        };

        document.exitFullscreen = function () {
            console.log('Exit full-screen intercepted');
            return Promise.resolve();
        };

        // Override fullscreenchange event listeners
        document.addEventListener = function (type, listener, options) {
            if (type === 'fullscreenchange' || type === 'webkitfullscreenchange' ||
                type === 'mozfullscreenchange' || type === 'MSFullscreenChange' ||
                type === 'visibilitychange' || type === 'webkitvisibilitychange') {
                console.log('Blocked ' + type + ' event listener on document');
                return;
            }
            return originalDocumentAddEventListener(type, listener, options);
        };

        // Fake fullscreenElement
        Object.defineProperty(document, 'fullscreenElement', {
            get: function () {
                return document.documentElement; // Always return something
            },
            configurable: true
        });
    }

    // 4. BLOCK MULTI-MONITOR DETECTION HEURISTICS
    if (SETTINGS.bypassMultiMonitor) {
        // Override screen properties
        const originalScreen = window.screen;
        Object.defineProperty(window, 'screen', {
            get: function () {
                const fakeScreen = {
                    width: originalScreen.width,
                    height: originalScreen.height,
                    availWidth: originalScreen.availWidth,
                    availHeight: originalScreen.availHeight,
                    colorDepth: originalScreen.colorDepth,
                    pixelDepth: originalScreen.pixelDepth,
                    // Prevent detection of multi-monitor setups
                    left: 0,
                    top: 0,
                    isExtended: false
                };
                return fakeScreen;
            },
            configurable: true
        });

        // Block mouse movement tracking
        let lastMouseX = 0;
        let lastMouseY = 0;
        document.addEventListener('mousemove', (e) => {
            // Normalize mouse movement to prevent detection of rapid movements
            const now = Date.now();
            if (now % 10 === 0) { // Only record every 10ms
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        }, true);
    }

    // 5. BLOCK HEARTBEAT/ANOMALY DETECTION
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalFetch = window.fetch;

    if (SETTINGS.blockTelemetry) {
        // Override XMLHttpRequest and fetch to monitor requests
        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = url;
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            // Check if this is a heartbeat/telemetry request
            // Be more specific to avoid blocking legitimate requests
            if (this._url && (
                this._url.includes('/heartbeat') ||
                this._url.includes('/telemetry') ||
                this._url.includes('/proctoring') ||
                this._url.includes('/activity-monitor') ||
                this._url.includes('/tab-switch')
            )) {
                console.log('Blocked telemetry request to:', this._url);
                // Simulate successful response
                this.readyState = 4;
                this.status = 200;
                this.statusText = 'OK';
                if (this.onreadystatechange) {
                    this.onreadystatechange();
                }
                return;
            }
            return originalXHRSend.apply(this, arguments);
        };

        window.fetch = function (resource, init) {
            const url = resource.url || resource;
            // Check if this is a heartbeat/telemetry request
            // Be more specific to avoid blocking legitimate requests
            if (url && (
                url.includes('/heartbeat') ||
                url.includes('/telemetry') ||
                url.includes('/proctoring') ||
                url.includes('/activity-monitor') ||
                url.includes('/tab-switch')
            )) {
                console.log('Blocked telemetry fetch to:', url);
                // Return a fake successful response
                return Promise.resolve(new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            return originalFetch.apply(this, arguments);
        };
    } // End of SETTINGS.blockTelemetry

    // 6. RESTORE NORMAL FUNCTIONALITY FOR USER INTERACTION
    // Allow normal event handling after a short delay
    setTimeout(() => {
        // Restore addEventListener for non-monitoring events
        EventTarget.prototype.addEventListener = originalAddEventListener;
        document.addEventListener = originalDocumentAddEventListener;

        // But keep blocking specific anti-cheat events only if enabled
        if (SETTINGS.bypassTabDetection) {
            const blockEvents = ['visibilitychange', 'webkitvisibilitychange'];

            const newAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (blockEvents.includes(type)) {
                    console.log(`Blocked ${type} event listener`);
                    return;
                }
                return newAddEventListener.call(this, type, listener, options);
            };
        }
    }, 1000);

    // 7. PRESERVE PRIMEFACES AJAX FUNCTIONALITY
    // Ensure PrimeFaces AJAX works correctly after DOM updates
    const preservePrimeFaces = () => {
        // Re-apply ACE bypass after PrimeFaces AJAX updates
        if (window.PrimeFaces && window.PrimeFaces.ajax) {
            const originalAjaxResponse = window.PrimeFaces.ajax.Response &&
                window.PrimeFaces.ajax.Response.handle;
            if (originalAjaxResponse && !window._pfAjaxPatched) {
                window._pfAjaxPatched = true;
                window.PrimeFaces.ajax.Response.handle = function (...args) {
                    const result = originalAjaxResponse.apply(this, args);
                    // Re-apply bypass after AJAX update
                    setTimeout(bypassAceEditor, 100);
                    return result;
                };
            }

            // Also patch the request to sync code before AJAX
            const originalAjaxRequest = window.PrimeFaces.ajax.Request &&
                window.PrimeFaces.ajax.Request.handle;
            if (originalAjaxRequest && !window._pfAjaxRequestPatched) {
                window._pfAjaxRequestPatched = true;
                window.PrimeFaces.ajax.Request.handle = function (cfg, ...rest) {
                    // Sync ACE editor content before AJAX request
                    if (window.txtCode && window.jQuery) {
                        const $ = window.jQuery;
                        if ($("#txtCode").length && window.txtCode.getSession) {
                            const val = window.txtCode.getSession().getValue();
                            $("#txtCode").val(val);
                        }
                    }
                    return originalAjaxRequest.call(this, cfg, ...rest);
                };
            }
        }
    };

    // Check for PrimeFaces
    const pfCheck = setInterval(() => {
        if (window.PrimeFaces) {
            preservePrimeFaces();
            clearInterval(pfCheck);
        }
    }, 100);
    setTimeout(() => clearInterval(pfCheck), 10000);

    // 8. ENSURE CODE SYNC ON FORM SUBMIT
    // Intercept form submissions to sync ACE editor content
    const syncCodeBeforeSubmit = () => {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            if (form._syncPatched) return;
            form._syncPatched = true;

            form.addEventListener('submit', function (e) {
                // Sync ACE editor content before form submission
                if (window.txtCode && window.jQuery) {
                    const $ = window.jQuery;
                    if ($("#txtCode").length && window.txtCode.getSession) {
                        const val = window.txtCode.getSession().getValue();
                        $("#txtCode").val(val);
                        console.log('Synced code before form submit');
                    }
                }
            }, true); // Capture phase to run first
        });
    };

    // Run sync setup when DOM is ready and after delays for dynamic forms
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(syncCodeBeforeSubmit, 500);
            setTimeout(syncCodeBeforeSubmit, 2000);
        });
    } else {
        setTimeout(syncCodeBeforeSubmit, 500);
        setTimeout(syncCodeBeforeSubmit, 2000);
    }

    // ============================================
    // 9. CAPTCHA SOLVER (Credit: adithyagenie)
    // https://github.com/adithyagenie/skillrack-captcha-solver
    // ============================================


    const TUTOR_REGEX = /https:\/\/(www.)?skillrack\.com\/faces\/candidate\/tutorprogram\.xhtml/gi;
    const ERROR_CLASS = "ui-growl-item";
    const CAPTCHA_INPUT_ID = "capval";
    const PROCEED_BTN_ID = "proceedbtn";

    // ===== TIMING CONFIGURATION =====
    const CAPTCHA_CONFIG = {
        initialDelay: 800,
        retryDelay: 400,
        maxRetries: 12,
        observerTimeout: 8000
    };

    // Find captcha image dynamically
    function findCaptchaImage() {
        const allImages = document.querySelectorAll('img');
        const idPattern = /^j_id_[a-zA-Z0-9]+$/;

        for (const img of allImages) {
            if (img.id && idPattern.test(img.id)) {
                if (img.src && img.src.length > 100) {
                    console.log(`[Captcha] Found image with matching ID pattern: ${img.id}`);
                    return img;
                }
            }
        }

        const knownIds = ['j_id_5s', 'j_id_76', 'j_id_75', 'j_id_74', 'j_id_5r', 'j_id_5t'];
        for (const id of knownIds) {
            const img = document.getElementById(id);
            if (img && img.tagName === 'IMG' && img.src && img.src.length > 100) {
                console.log(`[Captcha] Found image with known ID: ${id}`);
                return img;
            }
        }

        const base64Images = document.querySelectorAll('img[src^="data:image"]');
        for (const img of base64Images) {
            const width = img.width || img.naturalWidth;
            const height = img.height || img.naturalHeight;

            if (width > 50 && width < 400 && height > 20 && height < 100) {
                console.log(`[Captcha] Found base64 image: ${width}x${height}`);
                return img;
            }
        }

        const codeEditorPanel = document.getElementById('codeeditorpanel');
        if (codeEditorPanel) {
            const img = codeEditorPanel.querySelector('img[src^="data:image"]');
            if (img && img.src && img.src.length > 100) {
                console.log('[Captcha] Found image in code editor panel');
                return img;
            }
        }

        const captchaInput = document.getElementById(CAPTCHA_INPUT_ID);
        if (captchaInput) {
            let container = captchaInput.parentElement;
            for (let i = 0; i < 5 && container; i++) {
                const img = container.querySelector('img[src^="data:image"]');
                if (img && img.src && img.src.length > 100) {
                    console.log(`[Captcha] Found image near input (depth: ${i})`);
                    return img;
                }
                container = container.parentElement;
            }
        }

        return null;
    }

    // Wait for captcha image with retry
    function waitForCaptchaImage() {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            function tryFind() {
                attempts++;
                const img = findCaptchaImage();

                if (img) {
                    console.log(`[Captcha] ✓ Image found on attempt ${attempts}`);
                    resolve(img);
                    return;
                }

                if (attempts >= CAPTCHA_CONFIG.maxRetries) {
                    console.log(`[Captcha] Retry exhausted, trying MutationObserver...`);
                    waitForCaptchaWithObserver()
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                console.log(`[Captcha] Attempt ${attempts}/${CAPTCHA_CONFIG.maxRetries} - waiting...`);
                setTimeout(tryFind, CAPTCHA_CONFIG.retryDelay);
            }

            setTimeout(tryFind, CAPTCHA_CONFIG.initialDelay);
        });
    }

    function waitForCaptchaWithObserver() {
        return new Promise((resolve, reject) => {
            const img = findCaptchaImage();
            if (img) {
                resolve(img);
                return;
            }

            console.log('[Captcha] Setting up DOM observer...');

            let resolved = false;
            const observer = new MutationObserver(() => {
                if (resolved) return;

                const img = findCaptchaImage();
                if (img) {
                    resolved = true;
                    observer.disconnect();
                    console.log('[Captcha] ✓ Image detected by observer');
                    resolve(img);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'id']
            });

            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    console.warn('[Captcha] ✗ Observer timeout - no image found');
                    reject(new Error('Captcha image not found'));
                }
            }, CAPTCHA_CONFIG.observerTimeout);
        });
    }

    function findBackButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.includes('Back')) {
                return btn;
            }
        }
        const knownIds = ['j_id_63', 'j_id_62'];
        for (const id of knownIds) {
            const btn = document.getElementById(id);
            if (btn) return btn;
        }
        return null;
    }

    // ===== IMPROVED: Enhanced image processing for better OCR =====
    function processImageForOCR(image) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Scale up for better OCR accuracy
        const scale = 3;
        canvas.width = (image.width || image.naturalWidth || 200) * scale;
        canvas.height = (image.height || image.naturalHeight || 50) * scale;

        // Enable image smoothing for upscaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw scaled image
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // ===== ENHANCED PROCESSING =====
        // Convert to high contrast black/white with threshold
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Calculate luminance
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

            // Apply threshold (adjust if needed - lower = more black)
            const threshold = 140;
            const value = luminance < threshold ? 0 : 255;

            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            // Alpha stays the same
        }

        ctx.putImageData(imageData, 0, 0);

        return canvas.toDataURL();
    }

    // ===== IMPROVED: Alternative invert processing =====
    function invertColors(image) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const scale = 2;
        canvas.width = (image.width || image.naturalWidth || 200) * scale;
        canvas.height = (image.height || image.naturalHeight || 50) * scale;

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        return canvas.toDataURL();
    }

    // ===== IMPROVED: Smarter math expression parser =====
    function solveCaptcha(text) {
        const username = SETTINGS.captchaUsername || "";
        let cleanedText = text;

        // Remove username patterns (handle OCR adding spaces)
        // Pattern: 12 digits followed by @ and letters (with possible spaces)
        cleanedText = cleanedText.replace(/\d{9,12}\s*@\s*[a-zA-Z]+/gi, "").trim();

        // Also remove any standalone 12-digit numbers (roll numbers)
        cleanedText = cleanedText.replace(/\b\d{9,12}\b/g, "").trim();

        // Also try removing the configured username (with flexible spacing)
        if (username) {
            // Create pattern that allows spaces around @
            const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flexiblePattern = escapedUsername.replace(/@/g, '\\s*@\\s*');
            cleanedText = cleanedText.replace(new RegExp(flexiblePattern, "gi"), "").trim();
        }

        // Remove any remaining @ symbols and email-like patterns
        cleanedText = cleanedText.replace(/@[a-zA-Z]+/gi, "").trim();

        // Remove common OCR noise
        cleanedText = cleanedText.replace(/[\n\r\t]/g, " ").trim();

        // Remove multiple spaces
        cleanedText = cleanedText.replace(/\s+/g, " ").trim();

        console.log(`[Captcha] Cleaned text: "${cleanedText}"`);

        // ===== METHOD 1: Standard pattern with + sign =====
        // This should match "100+3", "5+6", "23+45" etc.
        let match = cleanedText.match(/(\d+)\s*\+\s*(\d+)/);
        if (match) {
            const num1 = parseInt(match[1], 10);
            const num2 = parseInt(match[2], 10);
            // Validate both numbers are reasonable (1-999 to handle 3-digit numbers)
            if (num1 >= 1 && num1 <= 999 && num2 >= 1 && num2 <= 999) {
                const result = num1 + num2;
                console.log(`[Captcha] Pattern 1 (X+Y): ${num1} + ${num2} = ${result}`);
                return result;
            }
        }

        // ===== METHOD 2: Handle 2-digit number that should be two single digits =====
        // e.g., "72" is really "7+2" (OCR missed the + sign)
        match = cleanedText.match(/^(\d{2})$/);
        if (match) {
            const numStr = match[1];
            const num1 = parseInt(numStr[0], 10);
            const num2 = parseInt(numStr[1], 10);
            // Both should be non-zero single digits
            if (num1 >= 1 && num1 <= 9 && num2 >= 1 && num2 <= 9) {
                const result = num1 + num2;
                console.log(`[Captcha] Pattern 2 (XY->X+Y): ${num1} + ${num2} = ${result}`);
                return result;
            }
        }

        // ===== METHOD 3: Handle merged 3-4 digits (1748 -> 17+48) =====
        // Look for 3-4 digit number that could be two numbers merged
        match = cleanedText.match(/(\d{3,4})/);
        if (match) {
            const numStr = match[1];
            console.log(`[Captcha] Found merged number: ${numStr}`);

            // Try splitting at different positions
            const results = [];

            for (let i = 1; i < numStr.length; i++) {
                const num1 = parseInt(numStr.substring(0, i), 10);
                const num2 = parseInt(numStr.substring(i), 10);

                // Valid split: both numbers should be reasonable (1-99)
                if (num1 >= 1 && num1 <= 99 && num2 >= 1 && num2 <= 99) {
                    const sum = num1 + num2;
                    results.push({ num1, num2, sum, split: i });
                    console.log(`[Captcha] Possible split: ${num1} + ${num2} = ${sum}`);
                }
            }

            // If only one valid split, use it
            if (results.length === 1) {
                console.log(`[Captcha] ✓ Using split: ${results[0].num1} + ${results[0].num2}`);
                return results[0].sum;
            }

            // If multiple splits possible, prefer middle split (most common for 4 digits)
            if (results.length > 1 && numStr.length === 4) {
                const middleSplit = results.find(r => r.split === 2);
                if (middleSplit) {
                    console.log(`[Captcha] ✓ Using middle split: ${middleSplit.num1} + ${middleSplit.num2}`);
                    return middleSplit.sum;
                }
            }

            // Fallback: use first valid split
            if (results.length > 0) {
                console.log(`[Captcha] ✓ Using first split: ${results[0].num1} + ${results[0].num2}`);
                return results[0].sum;
            }
        }

        // ===== METHOD 3: Two separate numbers on same line =====
        match = cleanedText.match(/(\d{1,2})\s+(\d{1,2})/);
        if (match) {
            const result = parseInt(match[1], 10) + parseInt(match[2], 10);
            console.log(`[Captcha] Pattern 3 (X Y): ${match[1]} + ${match[2]} = ${result}`);
            return result;
        }

        // ===== METHOD 4: Numbers with + as 4 or t or similar OCR errors =====
        match = cleanedText.match(/(\d{1,2})\s*[4tT\+xX\*]\s*(\d{1,2})/);
        if (match) {
            const result = parseInt(match[1], 10) + parseInt(match[2], 10);
            console.log(`[Captcha] Pattern 4 (OCR fix): ${match[1]} + ${match[2]} = ${result}`);
            return result;
        }

        return null;
    }

    function safeButtonClick(button) {
        if (!button) return;

        setTimeout(() => {
            try {
                const evt = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                button.dispatchEvent(evt);
            } catch (err) {
                console.log('Button click fallback:', err);
                button.click();
            }
        }, 50);
    }

    // ===== CAPTCHA RETRY TRACKING (uses localStorage for persistence across refreshes) =====
    const CAPTCHA_MAX_AUTO_RETRIES = 3; // Stop auto-solving after this many FAILED attempts
    const CAPTCHA_STORAGE_KEY = 'skillrack_captcha_retries';
    const CAPTCHA_PENDING_KEY = 'skillrack_captcha_pending';
    const CAPTCHA_FAILED_KEY = 'skillrack_captcha_failed';

    function getCaptchaRetryCount() {
        return parseInt(localStorage.getItem(CAPTCHA_STORAGE_KEY) || '0', 10);
    }

    function incrementCaptchaRetry() {
        const count = getCaptchaRetryCount() + 1;
        localStorage.setItem(CAPTCHA_STORAGE_KEY, count.toString());
        console.log(`[Captcha] Retry count: ${count}/${CAPTCHA_MAX_AUTO_RETRIES}`);
        return count;
    }

    function resetCaptchaRetry() {
        localStorage.removeItem(CAPTCHA_STORAGE_KEY);
        localStorage.removeItem(CAPTCHA_PENDING_KEY);
        localStorage.removeItem(CAPTCHA_FAILED_KEY);
        console.log('[Captcha] Retry count reset');
    }

    // ===== IMPROVED: Multiple OCR attempts with different processing =====
    async function handleCaptcha() {
        if (!SETTINGS.enableCaptchaSolver) return;

        // Check if we've exceeded max auto-retries
        const retryCount = getCaptchaRetryCount();
        if (retryCount >= CAPTCHA_MAX_AUTO_RETRIES) {
            console.log(`[Captcha] ⚠️ Max auto-retries (${CAPTCHA_MAX_AUTO_RETRIES}) reached - stopping auto-solve`);
            handleIncorrectCaptcha();
            return;
        }

        if (typeof Tesseract === 'undefined') {
            console.log('[Captcha] Tesseract not loaded, skipping');
            return;
        }

        console.log('[Captcha] Starting captcha detection...');

        let image;
        try {
            image = await waitForCaptchaImage();
        } catch (e) {
            console.error('[Captcha] Failed to find captcha image:', e.message);
            return;
        }

        const textbox = document.getElementById(CAPTCHA_INPUT_ID);
        const button = document.getElementById(PROCEED_BTN_ID);

        if (!textbox || !button) {
            console.log("[Captcha] Input or button not found. Input:", !!textbox, "Button:", !!button);
            return;
        }

        console.log("[Captcha] All elements found! Processing OCR...");

        // Ensure image is fully loaded
        if (!image.complete) {
            await new Promise(resolve => {
                image.onload = resolve;
                setTimeout(resolve, 1000);
            });
        }

        // ===== USE ONE OCR METHOD PER RETRY (HIERARCHY) =====
        const processingMethods = [
            { name: "Enhanced", fn: () => processImageForOCR(image) },
            { name: "Inverted", fn: () => invertColors(image) },
            { name: "Original", fn: () => image.src }
        ];

        // Use retry count to pick which method to try (hierarchy: Enhanced → Inverted → Original)
        const retryIdx = getCaptchaRetryCount();
        const methodIdx = Math.min(retryIdx, processingMethods.length - 1);
        const method = processingMethods[methodIdx];

        console.log(`[Captcha] Using ${method.name} processing (attempt ${retryIdx + 1}/${CAPTCHA_MAX_AUTO_RETRIES})...`);

        try {
            const processedImg = method.fn();

            const { data: { text } } = await Tesseract.recognize(processedImg, "eng", {
                tessedit_char_whitelist: "0123456789+= ",
                tessedit_pageseg_mode: "7", // Single line
            });

            console.log(`[Captcha] OCR Result (${method.name}): "${text.trim()}"`);
            const result = solveCaptcha(text);

            if (result !== null) {
                // Validate result is reasonable (1-198 for sum of two 1-99 numbers)
                if (result < 1 || result > 198) {
                    console.log(`[Captcha] ⚠️ Result ${result} seems invalid`);
                    handleIncorrectCaptcha();
                    return;
                }

                console.log(`[Captcha] ✓ Solution found: ${result}`);
                console.log(`[Captcha] Submitting answer...`);

                // Mark that we're attempting (will be checked on next page load)
                localStorage.setItem(CAPTCHA_PENDING_KEY, 'true');

                textbox.value = result;
                setTimeout(() => safeButtonClick(button), 100);
                return;
            }

        } catch (error) {
            console.error(`[Captcha] ${method.name} OCR Error:`, error);
        }

        // Method failed to produce a valid result
        console.log(`[Captcha] ✗ ${method.name} OCR method failed`);
        handleIncorrectCaptcha();
    }


    function handleIncorrectCaptcha() {
        if (!SETTINGS.enableCaptchaSolver) return;

        // Mark that we've had an incorrect captcha attempt
        sessionStorage.setItem('captchaAttemptFailed', 'true');

        const retryCount = getCaptchaRetryCount();
        console.log(`[Captcha] ⚠️ Auto-solve failed after ${retryCount} attempts - requesting manual input`);

        const captext = prompt(`❌ Captcha auto-solve failed (${retryCount} attempts).\n\nPlease look at the captcha image and enter the math result manually:\n(e.g., if you see "7 + 2", enter "9")`);

        if (captext === null || captext.trim() === '') {
            console.log('[Captcha] User cancelled manual input');
            return;
        }

        const textbox = document.getElementById(CAPTCHA_INPUT_ID);
        const button = document.getElementById(PROCEED_BTN_ID);

        if (textbox && button) {
            // Reset retry count on manual input (user is solving it now)
            resetCaptchaRetry();

            textbox.value = captext.trim();
            setTimeout(() => safeButtonClick(button), 100);
        }
    }

    document.addEventListener("click", (event) => {
        if (SETTINGS.enableCaptchaSolver &&
            event.target.tagName === "SPAN" &&
            event.target.parentNode.tagName === "BUTTON" &&
            event.target.textContent === "Solve") {
            sessionStorage.setItem("Solvebtnid", event.target.parentNode.id);
            // Reset ALL failure tracking when user manually clicks Solve button
            resetCaptchaRetry();
        }
    }, false);

    // Check if captcha elements exist on the current page
    // Check if we're on the CODING page (has Run, Save buttons)
    function isOnCodingPageGlobal() {
        // Check for Run button
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent || '';
            if (text.includes('Run') || text.includes('Save') || text.includes('Submit')) {
                return true;
            }
        }
        // Check for code editor
        if (document.getElementById('txtCode') || document.querySelector('.ace_editor')) {
            return true;
        }
        return false;
    }

    function hasCaptchaElements() {
        // If we're on coding page with Run/Save buttons, we're NOT on captcha page
        if (isOnCodingPageGlobal()) {
            return false;
        }

        const captchaInput = document.getElementById(CAPTCHA_INPUT_ID);
        const proceedBtn = document.getElementById(PROCEED_BTN_ID);
        // Must have both input and proceed button visible
        return captchaInput && proceedBtn && (proceedBtn.offsetParent !== null || proceedBtn.style.display !== 'none');
    }

    function initCaptchaSolver() {
        if (!SETTINGS.enableCaptchaSolver) return;

        // Log current retry state
        const currentRetries = getCaptchaRetryCount();
        const hasPending = localStorage.getItem(CAPTCHA_PENDING_KEY);
        const hasFailed = localStorage.getItem(CAPTCHA_FAILED_KEY);
        console.log(`[Captcha] State: retries=${currentRetries}, pending=${!!hasPending}, failed=${!!hasFailed}`);

        // FIRST: Check if captcha elements exist on this page
        if (!hasCaptchaElements()) {
            console.log('[Captcha] No captcha on this page - skipping');

            // If we're on the coding page (AI solution page), ALWAYS reset captcha state
            // This ensures fresh start when user navigates back to solve another problem
            if (isOnCodingPageGlobal()) {
                console.log('[Captcha] On coding page - resetting all captcha state for fresh start');
                resetCaptchaRetry();
            } else if (hasPending) {
                // Clear pending flag if we successfully passed captcha (on other pages)
                console.log('[Captcha] ✓ Previous captcha was correct! Resetting retry count.');
                localStorage.removeItem(CAPTCHA_PENDING_KEY);
                resetCaptchaRetry();
            }
            return;
        }

        // We ARE on a captcha page
        console.log('[Captcha] Captcha page detected');

        // Check for Incorrect Captcha error on page
        const errors = document.getElementsByClassName(ERROR_CLASS);
        let hasIncorrectCaptchaError = false;
        for (let err of errors) {
            if (err.textContent && err.textContent.includes("Incorrect Captcha")) {
                hasIncorrectCaptchaError = true;
                console.log('[Captcha] Found "Incorrect Captcha" error message');
                break;
            }
        }

        // If we had a pending submit and we're STILL on captcha page, it failed
        // (Either explicit error OR page just reloaded with new captcha)
        if (hasPending) {
            localStorage.removeItem(CAPTCHA_PENDING_KEY);

            // Being back on captcha page after submit = failure
            const newCount = incrementCaptchaRetry();
            console.log(`[Captcha] ✗ Previous attempt FAILED - back on captcha page (${newCount}/${CAPTCHA_MAX_AUTO_RETRIES})`);

            // Check if we've exceeded max retries
            if (newCount >= CAPTCHA_MAX_AUTO_RETRIES) {
                console.log('[Captcha] ⚠️ Max retries reached - requesting manual input');
                localStorage.setItem(CAPTCHA_FAILED_KEY, 'true');
                handleIncorrectCaptcha();
                return;
            }
        }

        // Don't auto-solve if marked as failed
        if (hasFailed || localStorage.getItem(CAPTCHA_FAILED_KEY)) {
            console.log('[Captcha] Manual mode - not auto-solving (max retries exceeded)');
            // Show prompt for manual input
            handleIncorrectCaptcha();
            return;
        }

        if (sessionStorage.getItem("captchaFail")) {
            sessionStorage.removeItem("captchaFail");
            const oldBtnId = sessionStorage.getItem("Solvebtnid");
            if (oldBtnId) {
                const oldBtn = document.getElementById(oldBtnId);
                if (oldBtn) oldBtn.click();
            }
            return;
        }

        handleCaptcha();
    }

    // Initialize captcha solver only if script is enabled
    onScriptEnabled(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCaptchaSolver);
        } else {
            setTimeout(initCaptchaSolver, 100);
        }

        window.addEventListener("load", function () {
            setTimeout(() => {
                // Clear the failure flag when page reloads after successful submission
                const errors = document.getElementsByClassName(ERROR_CLASS);
                let hasIncorrectCaptchaError = false;
                for (let err of errors) {
                    if (err.textContent.includes("Incorrect Captcha")) {
                        hasIncorrectCaptchaError = true;
                        break;
                    }
                }

                // Only clear flags if there's no error (meaning previous attempt was successful)
                if (!hasIncorrectCaptchaError) {
                    resetCaptchaRetry();
                }

                const img = findCaptchaImage();
                const textbox = document.getElementById(CAPTCHA_INPUT_ID);
                if (img && textbox && !textbox.value) {
                    console.log('[Captcha] Backup initialization triggered');
                    handleCaptcha();
                }
            }, 500);
        });

        console.log('Anti-cheat bypass script v5.0 loaded successfully');
        console.log('Settings:', SETTINGS);
    });

    // ============================================
    // 10. AI SOLUTION GENERATOR
    // Uses Gemini, OpenAI, OpenRouter, Puter.js, G4F, DuckDuckGo, or YuppBridge to generate code solutions
    // ============================================

    const getSelectedLanguage = () => {
        const langSelect = document.getElementById('langs_input');
        if (!langSelect) return 'C';

        const selectedOption = langSelect.options[langSelect.selectedIndex];
        if (!selectedOption) return 'C';

        const text = selectedOption.text || selectedOption.textContent;
        if (text.includes('Java')) return 'Java';
        if (text.includes('Python')) return 'Python';
        if (text.includes('CPP23')) return 'C++23';
        if (text.includes('CPP')) return 'C++';
        return 'C';
    };



    const cleanJSONResponse = (text) => {
        if (!text) return '';
        let cleaned = text.trim();
        // Remove markdown code blocks like ```json ... ``` or ``` ... ```
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/, '');
        return cleaned.trim();
    };

    const reconstructFullMFIBCode = (template, answers) => {
        let full = template;
        answers.forEach((ans, index) => {
            full = full.replace(`[BLANK_${index}]`, ans);
        });
        return full;
    };

    const extractMFIBTemplate = () => {
        // Base selector for inputs, ignoring ace text area and ensuring we target potential blanks
        const inputSelector = 'input.blankcode, input[id^="blank"], input[name^="blank"], input.ui-inputtext, input[type="text"]:not(.ace_text-input)';

        // Helper to filter out helper panels, settings panel, captcha, etc.
        const isActualCodingBlank = (el) => {
            if (!el) return false;
            // Ignore settings panel inputs
            if (el.closest('#bypass-settings-panel')) return false;
            // Ignore captcha inputs
            if (el.id === 'capval' || el.closest('#captcha-container') || el.closest('[id*="captcha"]')) return false;
            // Ignore auto solver status panels
            if (el.closest('#auto-solver-status')) return false;
            // Ignore inputs inside standard buttons or other UI elements that aren't code blanks
            if (el.closest('.ui-button') || el.closest('button')) return false;
            // Must be visible
            return el.offsetParent !== null;
        };

        let container = null;

        // On SkillRack, MFIB blanks are always contained in multifibpanel.
        // We look for multifibpanel first.
        const mfibPanel = document.getElementById('multifibpanel');
        if (mfibPanel) {
            const inputs = Array.from(mfibPanel.querySelectorAll(inputSelector)).filter(isActualCodingBlank);
            if (inputs.length > 0) {
                container = mfibPanel;
            }
        }

        // Fallbacks for other possible panel variations (codeeditorpanel, codediv, codeform)
        if (!container) {
            const candidates = ['codeeditorpanel', 'codediv', 'codeform'];
            for (const id of candidates) {
                const el = document.getElementById(id);
                if (el) {
                    const inputs = Array.from(el.querySelectorAll(inputSelector)).filter(isActualCodingBlank);
                    if (inputs.length > 0) {
                        container = el;
                        break;
                    }
                }
            }
        }

        if (!container) return { template: '', inputs: [] };

        // Gather and filter candidate inputs
        const rawInputs = Array.from(container.querySelectorAll(inputSelector)).filter(isActualCodingBlank);
        if (rawInputs.length === 0) return { template: '', inputs: [] };

        let template = '';
        let blankCount = 0;
        const blankInputs = [];

        // Walk the DOM in document order to preserve code/blank interleaving
        const traverse = (node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();

                // Blank input — mark position and record element
                if (tag === 'INPUT' && rawInputs.includes(node)) {
                    template += `[BLANK_${blankCount}]`;
                    blankInputs.push(node);
                    blankCount++;
                    return; // do not traverse children
                }

                // Pre block — grab decoded text content as-is
                if (tag === 'PRE') {
                    // .textContent decodes HTML entities (&lt; → <, etc.)
                    template += node.textContent;
                    return; // do not traverse children (avoid double-counting)
                }

                // Skip script/style subtrees
                if (tag === 'SCRIPT' || tag === 'STYLE') return;

                // Skip settings panel or auto-solver status indicator subtrees
                if (node.id === 'bypass-settings-panel' || node.id === 'auto-solver-status') return;

                for (const child of node.childNodes) {
                    traverse(child);
                }
            } else if (node.nodeType === Node.TEXT_NODE) {
                // Plain text nodes between elements (e.g. spaces / newlines)
                const t = node.textContent;
                if (t.trim()) template += t;
            }
        };

        traverse(container);
        return { template: template.trim(), inputs: blankInputs };
    };

    const getProblemDescription = () => {
        const isTutorPage = window.location.href.includes('tutorprogram');
        const isCodeTrackPage = window.location.href.includes('codeprogram');

        // Find the problem description card
        const cards = document.querySelectorAll('.ui-card-content');
        let card = null;
        for (const c of cards) {
            if (c.querySelector('.ribbon')) {
                card = c;
                break;
            }
        }
        // Fallback: use first card if no ribbon card is found (common on exams/tests)
        if (!card && cards.length > 0) {
            card = cards[0];
        }

        if (card) {
            let problemTitle = '';
            let description = '';
            let tutorialHint = '';
            let preCode = '';
            let postCode = '';

            // Get the problem title (first .ui.label that's not ribbon/circular/image)
            const labels = card.querySelectorAll('.ui.label');
            for (const label of labels) {
                if (!label.classList.contains('ribbon') &&
                    !label.classList.contains('circular') &&
                    !label.classList.contains('image') &&
                    !label.textContent.includes('Max Execution') &&
                    !label.textContent.includes('ProgramID')) {
                    problemTitle = label.textContent.trim();
                    break;
                }
            }

            // For tutor pages, get the tutorial highlight (explanation)
            if (isTutorPage) {
                const tutorHighlight = card.querySelector('.tutorhighlight');
                if (tutorHighlight) {
                    tutorialHint = tutorHighlight.textContent.trim();
                }

                // Get pre-code and post-code from the code editor panel
                const preCodes = document.querySelectorAll('#codeeditorpanel pre, .ui-outputpanel pre');
                preCodes.forEach((pre, index) => {
                    const text = pre.textContent.trim();
                    // Skip empty or very short snippets
                    if (text.length > 5) {
                        if (index === 0 || pre.closest('#j_id_7a, [id*="_7a"]')) {
                            preCode = text;
                        } else if (index === 1 || pre.closest('#j_id_7c, [id*="_7c"]')) {
                            postCode = text;
                        }
                    }
                });

                // Alternative: find pre/post code by position in card
                if (!preCode || !postCode) {
                    const allPres = card.querySelectorAll('pre');
                    if (allPres.length >= 1 && !preCode) preCode = allPres[0].textContent.trim();
                    if (allPres.length >= 2 && !postCode) postCode = allPres[1].textContent.trim();
                }
            }

            // For code track pages, get pre-code and post-code (inline code)
            if (isCodeTrackPage) {
                // Look for pre elements in the code editor panel
                const codeEditorPanel = document.getElementById('codeeditorpanel');
                if (codeEditorPanel) {
                    const preCodes = codeEditorPanel.querySelectorAll('pre');
                    preCodes.forEach((pre) => {
                        const text = pre.textContent.trim();
                        // Skip empty snippets
                        if (text.length > 5) {
                            // Check if this is post-code (in #j_id_8t or similar)
                            if (pre.closest('#j_id_8t, [id*="_8t"]')) {
                                if (!postCode) {
                                    postCode = text;
                                }
                            } else if (pre.closest('#j_id_8n, [id*="_8n"]')) {
                                // This is pre-code
                                if (!preCode) {
                                    preCode = text;
                                }
                            } else if (!preCode) {
                                // Fallback: first pre element is likely pre-code
                                preCode = text;
                            }
                        }
                    });
                }

                // Also check for pre elements in the problem card itself
                const cardPres = card.querySelectorAll('pre');
                cardPres.forEach((pre) => {
                    const text = pre.textContent.trim();
                    if (text.length > 5 && !preCode) {
                        preCode = text;
                    }
                });

                // Fallback: Get all pres in codediv area
                if (!preCode || !postCode) {
                    const codeDivPres = document.querySelectorAll('#codediv pre, #codediv .ui-outputpanel pre');
                    const presList = Array.from(codeDivPres);
                    if (presList.length >= 1 && !preCode) preCode = presList[0].textContent.trim();
                    if (presList.length >= 2 && !postCode) postCode = presList[presList.length - 1].textContent.trim();
                }
            }

            // Get the problem description text
            const allText = card.textContent;
            const labelMatch = allText.indexOf(problemTitle);
            if (labelMatch !== -1) {
                const afterTitle = allText.substring(labelMatch + problemTitle.length);
                const maxExecIdx = afterTitle.indexOf('Max Execution');
                description = maxExecIdx !== -1 ? afterTitle.substring(0, maxExecIdx) : afterTitle;
            } else {
                description = card.textContent;
            }

            // Also get paragraphs for cleaner description
            const paragraphs = card.querySelectorAll('p');
            let pText = '';
            paragraphs.forEach(p => {
                const txt = p.textContent.trim();
                if (txt && !txt.includes('Max Execution')) {
                    pText += txt + '\n';
                }
            });
            if (pText) {
                description = pText.trim();
            }

            // Clean up description (remove formatting lines and leading/trailing whitespace)
            description = description.replace(/\s+/g, ' ').trim();

            // Build full context for AI
            let fullDescription = description;
            if (isTutorPage) {
                fullDescription = '';
                if (tutorialHint) {
                    fullDescription += `Tutorial Hint: ${tutorialHint}\n\n`;
                }
                fullDescription += `Task: ${description}\n`;
                if (SETTINGS.includePrePostCode) {
                    if (preCode) {
                        fullDescription += `\nPre-written code (DO NOT include this, it's already provided):\n\`\`\`\n${preCode}\n\`\`\`\n`;
                    }
                    if (postCode) {
                        fullDescription += `\nPost-code that will run after your solution (DO NOT include this):\n\`\`\`\n${postCode}\n\`\`\`\n`;
                    }
                    fullDescription += `\nIMPORTANT: Write ONLY the middle part of the code. The pre-code and post-code are already provided by the system.`;
                }
            } else if (isCodeTrackPage && (preCode || postCode)) {
                // For code track with inline code (pre-code and/or post-code)
                fullDescription = `Task: ${description}\n`;
                if (SETTINGS.includePrePostCode) {
                    if (preCode) {
                        fullDescription += `\nPre-written code (DO NOT include this, it's already provided):\n\`\`\`\n${preCode}\n\`\`\`\n`;
                    }
                    if (postCode) {
                        fullDescription += `\nPost-code that will run after your solution (DO NOT include this):\n\`\`\`\n${postCode}\n\`\`\`\n`;
                    }
                    fullDescription += `\nIMPORTANT: Write ONLY the middle part of the code. The pre-code and post-code are already provided by the system.`;
                }
            }

            const mfib = extractMFIBTemplate();

            return {
                title: problemTitle,
                description: fullDescription.trim(),
                isTutor: isTutorPage,
                isCodeTrack: isCodeTrackPage,
                preCode: preCode,
                postCode: postCode,
                isMFIB: mfib.inputs.length > 0,
                mfibTemplate: mfib.template,
                blankInputs: mfib.inputs
            };
        }
        const mfib = extractMFIBTemplate();
        return { title: '', description: '', isTutor: false, isCodeTrack: false, preCode: '', postCode: '', isMFIB: mfib.inputs.length > 0, mfibTemplate: mfib.template, blankInputs: mfib.inputs };
    };

    // ========== Get error information from page ==========
    const getErrorInfo = () => {
        let errorInfo = {
            hasError: false,
            errorType: null,  // 'wrong_output', 'compilation_error', or 'runtime_error'
            input: '',
            expectedOutput: '',
            yourOutput: '',
            compilationError: '',
            currentCode: ''
        };

        // Get current code from editor
        if (window.txtCode && window.txtCode.getSession) {
            errorInfo.currentCode = window.txtCode.getSession().getValue();
        }

        // Check for "Incorrect Captcha" - ignore this
        const growlItems = document.querySelectorAll('.ui-growl-item');
        for (const item of growlItems) {
            if (item.textContent.includes('Incorrect Captcha')) {
                return errorInfo; // Not a code error
            }
        }

        // Check for error panel
        const errorPanel = document.getElementById('errormsg');
        if (!errorPanel) return errorInfo;

        const panelContent = document.getElementById('errormsg_content');
        if (!panelContent) return errorInfo;

        // Check if it's visible/has content
        const panelText = panelContent.textContent.trim();
        if (!panelText) return errorInfo;

        errorInfo.hasError = true;

        // Check for compilation error (has error messages like "error:", "undefined reference", etc.)
        const compilationIndicators = [
            'error:', 'undefined reference', 'multiple definition',
            'ld returned', 'collect2:', 'fatal error', 'syntax error',
            'expected', 'undeclared', 'implicit declaration'
        ];

        // Check for runtime errors
        const runtimeIndicators = [
            'segmentation fault', 'core dumped', 'bus error', 'floating point exception',
            'abort', 'timeout', 'time limit exceeded', 'memory limit', 'stack overflow',
            'runtime error', 'killed', 'signal'
        ];

        const panelTextLower = panelText.toLowerCase();
        const isCompilationError = compilationIndicators.some(indicator =>
            panelTextLower.includes(indicator.toLowerCase())
        );

        const isRuntimeError = runtimeIndicators.some(indicator =>
            panelTextLower.includes(indicator.toLowerCase())
        );

        if (isCompilationError) {
            errorInfo.errorType = 'compilation_error';
            // Get the compilation error text
            const errorDiv = panelContent.querySelector('div[style*="word-wrap"]');
            if (errorDiv) {
                errorInfo.compilationError = errorDiv.textContent.replace(/\s+/g, ' ').trim();
            } else {
                errorInfo.compilationError = panelText;
            }
        } else if (isRuntimeError) {
            errorInfo.errorType = 'runtime_error';
            // Extract Input, Expected Output, Your Output (runtime error shows these)
            const cards = panelContent.querySelectorAll('.ui-card-content');
            const labels = panelContent.querySelectorAll('.ui.label');

            labels.forEach((label, index) => {
                const labelText = label.textContent.toLowerCase();
                const cardContent = cards[index]?.textContent.trim() || '';

                if (labelText.includes('input')) {
                    errorInfo.input = cardContent;
                } else if (labelText.includes('expected')) {
                    errorInfo.expectedOutput = cardContent;
                } else if (labelText.includes('your program') || labelText.includes('your output')) {
                    errorInfo.yourOutput = cardContent;
                }
            });
        } else {
            errorInfo.errorType = 'wrong_output';

            // Extract Input, Expected Output, Your Output
            const cards = panelContent.querySelectorAll('.ui-card-content');
            const labels = panelContent.querySelectorAll('.ui.label');

            labels.forEach((label, index) => {
                const labelText = label.textContent.toLowerCase();
                const cardContent = cards[index]?.textContent.trim() || '';

                if (labelText.includes('input')) {
                    errorInfo.input = cardContent;
                } else if (labelText.includes('expected')) {
                    errorInfo.expectedOutput = cardContent;
                } else if (labelText.includes('your program') || labelText.includes('your output')) {
                    errorInfo.yourOutput = cardContent;
                }
            });
        }

        return errorInfo;
    };

    const generateWithGemini = async (prompt) => {
        const apiKey = SETTINGS.geminiApiKey;
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add it in settings.');
        }

        const model = SETTINGS.geminiModel || 'gemini-2.5-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: SETTINGS.aiTemperature,
                    maxOutputTokens: 8192,
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API request failed');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    const generateWithOpenAI = async (prompt) => {
        const apiKey = SETTINGS.openaiApiKey;
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please add it in settings.');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: SETTINGS.openaiModel || 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: SETTINGS.aiTemperature,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    };

    // Shared OpenRouter request gate to avoid bursty 429s across repeated AutoSolver calls
    const OPENROUTER_RATE_STATE = {
        nextAllowedAt: 0,
        consecutive429: 0,
        minIntervalMs: 3000
    };

    const generateWithOpenRouter = async (prompt) => {
        const apiKey = SETTINGS.openrouterApiKey;
        if (!apiKey) {
            throw new Error('OpenRouter API key not configured. Please add it in settings.');
        }

        const primaryModel = SETTINGS.openrouterModel || 'openai/gpt-oss-120b:free';

        // Reasoning models reject temperature/top_p — detect by name
        const isReasoning = (m) => /gpt-oss|\bo[134]\b|deepseek-r1|qwen.*think|nemotron.*ultra|nemotron.*super|nemotron.*nano|laguna|liquid.*think|lfm.*think/i.test(m);


        // Build OpenAI-SDK-compatible request body for a given model
        const buildBody = (model) => {
            const body = {
                model,
                messages: [{ role: 'user', content: prompt }]
            };
            // Reasoning models must NOT have temperature — causes 422/429 provider errors
            if (!isReasoning(model)) {
                body.temperature = 0;
            }
            return body;
        };

        // Read Retry-After header from a 429 response and return wait time in ms.
        // `response` may be undefined (e.g. network-error path) — guard accordingly.
        const getRetryAfterMs = (response, fallbackMs) => {
            if (!response || typeof response.headers?.get !== 'function') {
                return fallbackMs;
            }
            try {
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter) {
                    const secs = parseFloat(retryAfter);
                    if (!isNaN(secs) && secs > 0) {
                        console.log(`[OpenRouter] Retry-After header: ${secs}s`);
                        return Math.ceil(secs * 1000) + 500; // add 500ms buffer
                    }
                }

                // Some gateways expose reset timestamp headers
                const resetUnix = response.headers.get('x-ratelimit-reset');
                if (resetUnix) {
                    const parsed = parseFloat(resetUnix);
                    if (!isNaN(parsed) && parsed > 0) {
                        const ms = parsed > 1e12 ? parsed - Date.now() : (parsed * 1000) - Date.now();
                        if (ms > 0) {
                            console.log(`[OpenRouter] x-ratelimit-reset header wait: ${Math.ceil(ms / 1000)}s`);
                            return Math.ceil(ms) + 500;
                        }
                    }
                }
            } catch (headerErr) {
                console.warn('[OpenRouter] Failed to read Retry-After header:', headerErr.message);
            }
            return fallbackMs;
        };

        const nowMs = () => Date.now();
        const jitter = (baseMs) => baseMs + Math.floor(Math.random() * 500);

        const mark429Cooldown = (response, fallbackMs) => {
            OPENROUTER_RATE_STATE.consecutive429 += 1;
            const headerWait = getRetryAfterMs(response, fallbackMs);
            const adaptivePenalty = Math.min(30000, Math.pow(2, Math.max(0, OPENROUTER_RATE_STATE.consecutive429 - 1)) * 1000);
            const waitMs = Math.max(headerWait, adaptivePenalty);
            OPENROUTER_RATE_STATE.nextAllowedAt = Math.max(OPENROUTER_RATE_STATE.nextAllowedAt, nowMs() + waitMs);
            return waitMs;
        };

        const markSuccessRateWindow = () => {
            OPENROUTER_RATE_STATE.consecutive429 = 0;
            OPENROUTER_RATE_STATE.nextAllowedAt = Math.max(OPENROUTER_RATE_STATE.nextAllowedAt, nowMs() + OPENROUTER_RATE_STATE.minIntervalMs);
        };

        const waitForRequestSlot = async (label = 'OpenRouter cooldown') => {
            const waitMs = OPENROUTER_RATE_STATE.nextAllowedAt - nowMs();
            if (waitMs > 0) {
                console.log(`[OpenRouter] Global gate wait ${Math.ceil(waitMs / 1000)}s (${label})`);
                await countdownWait(waitMs, label);
            }
        };

        // Helper to update UI button status during rate limit countdown
        const updateBtnStatus = (msg) => {
            const btn = document.getElementById('ai-solution-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = msg;
                btn.style.opacity = '0.7';
            }
        };

        const countdownWait = async (waitMs, reasonMsg) => {
            const end = Date.now() + waitMs;
            while (Date.now() < end) {
                const remainingSecs = Math.ceil((end - Date.now()) / 1000);
                updateBtnStatus(`${reasonMsg} (${remainingSecs}s)...`);
                await new Promise(r => setTimeout(r, 1000));
            }
            updateBtnStatus('Generating...');
        };

        // Single fetch attempt — returns { ok, status, content, errMsg, response }
        const attempt = async (model) => {
            await waitForRequestSlot('OpenRouter cooldown');
            console.log(`[OpenRouter] → POST model="${model}" reasoning=${isReasoning(model)}`);
            let response;
            try {
                response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'SkillRack AI Solver'
                    },
                    body: JSON.stringify(buildBody(model))
                });
            } catch (e) {
                return { ok: false, status: 0, errMsg: `Network error: ${e.message}` };
            }

            if (response.ok) {
                let data;
                try {
                    data = await response.json();
                } catch (parseErr) {
                    return { ok: false, status: 200, errMsg: `Failed to parse response JSON: ${parseErr.message}` };
                }

                // Validate we actually received generated content
                const content = data?.choices?.[0]?.message?.content;
                if (typeof content !== 'string' || content.trim() === '') {
                    // Surface provider-level errors returned inside a 200 response
                    const providerErr = data?.error?.message
                        || data?.choices?.[0]?.finish_reason
                        || 'Empty response from model';
                    console.warn(`[OpenRouter] model="${model}" 200 OK but empty content — reason: ${providerErr}`);
                    return { ok: false, status: 200, errMsg: providerErr };
                }

                markSuccessRateWindow();
                return { ok: true, status: 200, content };
            }

            // Parse error body safely
            let errMsg = `HTTP ${response.status}`;
            try {
                const errData = await response.json();
                errMsg = errData?.error?.message || errData?.message || JSON.stringify(errData);
            } catch (_) {
                try { errMsg = await response.text(); } catch (_2) { }
            }
            console.warn(`[OpenRouter] model="${model}" status=${response.status} err="${errMsg}"`);
            return { ok: false, status: response.status, errMsg, response };
        };

        // Unified request executor that retries a model on transient errors (429, 503, provider issues, etc.)
        const requestModelWithRetry = async (model, maxRetries = 3) => {
            const delays = [5000, 10000, 20000, 30000];
            let lastRes;

            for (let i = 0; i <= maxRetries; i++) {
                if (i > 0) {
                    const waitMs = lastRes?.status === 429
                        ? mark429Cooldown(lastRes?.response, delays[i - 1] || 10000)
                        : (delays[i - 1] || 10000);
                    console.log(`[OpenRouter] Retrying model "${model}" in ${waitMs / 1000}s (Retry ${i}/${maxRetries})...`);
                    await countdownWait(waitMs, `Rate limit (${model.split('/')[1] || model})`);
                }

                // Global pacing safety buffer even when no explicit cooldown header exists
                await new Promise(r => setTimeout(r, jitter(OPENROUTER_RATE_STATE.minIntervalMs)));

                lastRes = await attempt(model);
                if (lastRes.ok) {
                    return lastRes;
                }

                const isTransient = lastRes.status === 429
                    || lastRes.status === 424
                    || lastRes.status === 502
                    || lastRes.status === 503
                    || lastRes.status === 504
                    || lastRes.status === 0
                    || /rate.limit|overload|busy|provider.returned.error|too.many.requests/i.test(lastRes.errMsg || '');

                if (!isTransient) {
                    console.log(`[OpenRouter] Non-transient error for "${model}": ${lastRes.errMsg}`);
                    break; // break early on API auth errors, 400 bad request, etc.
                }
            }
            return lastRes;
        };

        // Try primary model first with retries
        console.log(`[OpenRouter] Trying primary model: "${primaryModel}"`);
        let lastResult = await requestModelWithRetry(primaryModel, 3);
        if (lastResult.ok) {
            return lastResult.content;
        }

        const primaryErr = lastResult.errMsg || 'Unknown error';
        throw new Error(`OpenRouter (${primaryModel}): ${primaryErr}`);
    };

    const generateWithPuter = async (prompt) => {
        if (typeof puter === 'undefined' || !puter?.ai?.chat) {
            throw new Error('Puter.js is not loaded. Reload the page or reinstall the userscript.');
        }

        const customModel = (SETTINGS.puterCustomModel || '').trim();
        const model = customModel || SETTINGS.puterModel || PuterProvider.CONFIG.DEFAULT_MODEL;
        const options = {
            model: model
        };

        if (SETTINGS.puterEnableReasoning) {
            options.reasoning_effort = SETTINGS.puterReasoningEffort || 'low';
        }

        const response = await puter.ai.chat(prompt, options);

        if (typeof response === 'string') {
            return response;
        }

        if (Array.isArray(response)) {
            return response
                .map(part => part?.text || part?.reasoning || part?.content || '')
                .filter(Boolean)
                .join('\n');
        }

        const messageContent = response?.message?.content;
        if (typeof messageContent === 'string') {
            return messageContent;
        }
        if (Array.isArray(messageContent)) {
            return messageContent
                .map(part => part?.text || part?.content || '')
                .filter(Boolean)
                .join('\n');
        }

        if (typeof response?.text === 'string') {
            return response.text;
        }

        return JSON.stringify(response || '', null, 2);
    };

    const stripComments = (code, language) => {
        let result = code;
        const lang = language.toLowerCase();

        if (lang === 'python') {
            result = result.replace(/#.*$/gm, '');
            result = result.replace(/'''[\s\S]*?'''/g, '');
            result = result.replace(/"""[\s\S]*?"""/g, '');
        } else if (lang === 'c' || lang === 'c++' || lang === 'c++23' || lang === 'java') {
            result = result.replace(/\/\/.*$/gm, '');
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        }

        result = result.replace(/^\s*[\r\n]/gm, '\n');
        result = result.replace(/\n{3,}/g, '\n\n');
        result = result.trim();

        return result;
    };

    const extractCode = (response, language) => {
        let normalizedResponse = typeof response === 'string' ? response : String(response || '');

        // Handle JSON responses (strip JSON wrapper if present)
        try {
            // Check if response looks like JSON
            if (normalizedResponse.trim().startsWith('{') && normalizedResponse.includes('"content"')) {
                const jsonData = JSON.parse(normalizedResponse);
                // Try to extract content from various JSON structures
                if (jsonData.choices && jsonData.choices[0]?.message?.content) {
                    normalizedResponse = jsonData.choices[0].message.content;
                } else if (jsonData.content) {
                    normalizedResponse = jsonData.content;
                } else if (jsonData.text) {
                    normalizedResponse = jsonData.text;
                }
            }
        } catch (e) {
            // Not JSON, continue with string processing
        }

        let code = '';

        // Match code blocks with language specifiers (c++, ++23, cpp, c, python, etc.)
        // Pattern: ```languageName followed by code and closing ```
        const codeBlockRegex = /```(?:[a-zA-Z0-9_+-]*)?\n?([\s\S]*?)```/g;
        const matches = [...normalizedResponse.matchAll(codeBlockRegex)];

        if (matches.length > 0) {
            // Find the longest match (most likely the actual code)
            let bestMatch = matches[0][1].trim();
            for (const match of matches) {
                const trimmed = match[1].trim();
                if (trimmed.length > bestMatch.length) {
                    bestMatch = trimmed;
                }
            }
            code = bestMatch;
        } else {
            // Fallback: look for unclosed code block
            const openBlockRegex = /```(?:[a-zA-Z0-9_+-]*)?\n?([\s\S]+?)(?=```|$)/;
            const openMatch = normalizedResponse.match(openBlockRegex);
            if (openMatch) {
                code = openMatch[1].trim();
            } else {
                // Last resort: use entire response and clean it
                code = normalizedResponse.trim();
                // Remove common explanatory prefixes
                const prefixes = ['Here is', 'Here\'s', 'The fixed code', 'The solution', 'Fixed code:', 'Solution:', 'Here\'s the code:', 'Here is the code:'];
                for (const prefix of prefixes) {
                    const lowerCode = code.toLowerCase();
                    if (lowerCode.startsWith(prefix.toLowerCase())) {
                        code = code.substring(prefix.length).trim();
                        break;
                    }
                }
            }
        }

        // CRITICAL FIX: Remove language specifiers that might have leaked in
        // Remove lines that only contain language tags like "c++", "++23", "cpp", etc.
        const languageTagRegex = /^(?:c|c\+\+|cpp|cpp11|cpp14|cpp17|cpp20|cpp23|\+\+|\+\+11|\+\+14|\+\+17|\+\+20|\+\+23|python|py|java|javascript|js|typescript|ts|go|rust|ruby|php|kotlin|swift)$/i;
        const lines = code.split('\n');
        code = lines.filter(line => {
            const trimmed = line.trim();
            // Skip lines that are ONLY language tags (case-insensitive, support c++, cpp, cpp23, ++, ++23, etc.)
            // Language tags: c, c++, cpp, cpp23, ++, ++23, python, java, javascript, typescript, etc.
            if (languageTagRegex.test(trimmed)) {
                return false; // This is likely a language tag, skip it
            }
            return true;
        }).join('\n');

        // Remove any backticks that leaked in (at line start/end only)
        code = code.replace(/^```[a-zA-Z0-9+]*\s*/gm, '');
        code = code.replace(/\s*```$/gm, '');

        // Also remove any standalone language tags on their own lines (more aggressive)
        code = code.split('\n').filter(line => {
            const trimmed = line.trim();
            return !(languageTagRegex.test(trimmed));
        }).join('\n');

        code = code.trim();

        code = stripComments(code, language);

        return code;
    };

    function getAiButtonMarkup(label = 'AI Solution') {
        return `<span style="display:inline-flex;align-items:center;gap:8px;"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:block;fill:currentColor;"><path d="M12 2a3 3 0 0 1 3 3v1.06a6.002 6.002 0 0 1 3.94 3.94H20a3 3 0 1 1 0 6h-1.06a6.002 6.002 0 0 1-3.94 3.94V21a3 3 0 1 1-6 0v-1.06A6.002 6.002 0 0 1 5.06 16H4a3 3 0 1 1 0-6h1.06A6.002 6.002 0 0 1 9 6.06V5a3 3 0 0 1 3-3Zm0 6a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z"></path></svg><span>${label}</span></span>`;
    }

    let isAiGenerationInProgress = false;

    // ========== UTILITY: Compare code similarity ==========
    const calculateCodeSimilarity = (code1, code2) => {
        // Simple similarity check: compare normalized code strings
        const normalize = (code) => {
            return code
                .replace(/\s+/g, ' ')
                .replace(/[{}();]/g, '')
                .toLowerCase()
                .trim();
        };

        const norm1 = normalize(code1);
        const norm2 = normalize(code2);

        if (norm1 === norm2) return 1.0; // Identical

        // Simple character-based similarity
        const minLen = Math.min(norm1.length, norm2.length);
        let matches = 0;
        for (let i = 0; i < minLen; i++) {
            if (norm1[i] === norm2[i]) matches++;
        }

        return matches / Math.max(norm1.length, norm2.length);
    };

    // ==========  generateAISolution FUNCTION ==========
    const generateAISolution = async () => {
        if (!SETTINGS.enableAISolver) return;
        if (isAiGenerationInProgress) {
            console.log('[AI] Generation already in progress - ignoring duplicate trigger');
            return;
        }
        isAiGenerationInProgress = true;

        const language = getSelectedLanguage();
        const problem = getProblemDescription();
        const errorInfo = getErrorInfo();  // NEW: Check for errors

        if (!problem.title && !problem.description && !errorInfo.hasError) {
            notifyPopup('Could not find problem description on this page.');
            isAiGenerationInProgress = false;
            return;
        }

        const customSystemPrompt = SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() + '\n\n' : '';
        let prompt;

        if (SETTINGS.enableFullScreenCopyMode) {
            const pageText = (document.body?.innerText || '').trim();
            prompt = `${customSystemPrompt}${pageText}${FULLSCREEN_COPY_PROMPT}`.trim();
        }

        // Helper: build full code by wrapping middle code with pre/post code
        const hasPrePost = problem.preCode || problem.postCode;
        const wrapWithPrePost = (middleCode) => {
            // If includePrePostCode is disabled, include the pre/post code in the AI request
            if (!SETTINGS.includePrePostCode && hasPrePost) {
                let full = '';
                if (problem.preCode) full += problem.preCode + '\n';
                full += middleCode;
                if (problem.postCode) full += '\n' + problem.postCode;
                return full;
            }
            // If includePrePostCode is enabled, only send middle code to AI
            return middleCode;
        };

        // ========== MFIB mode ==========
        if (!prompt && problem.isMFIB) {
            prompt = customSystemPrompt + `You are a ${language} expert solving a SkillRack "Fill In the Blanks" (MFIB) challenge.

The code template below has [BLANK_0], [BLANK_1], etc. marking positions where text has been removed.
Your job is to determine the exact text that belongs at each blank position so the program compiles and runs correctly.

IMPORTANT RULES:
- Each blank answer is the LITERAL text that goes directly into that position in the source code.
- Include any necessary punctuation that is part of the expression (quotes, semicolons, operators).
- Do NOT add text that already exists in the surrounding code (e.g. if the code already has '(' before the blank, do NOT add '(' in your answer).
- Preserve correct ${language} syntax, data types, and case-sensitivity.

PROBLEM: ${problem.title}
${problem.description}

CODE TEMPLATE:
\`\`\`${language.toLowerCase()}
${problem.mfibTemplate}
\`\`\`

Respond with ONLY a JSON array where element [i] is the answer for [BLANK_i].
No markdown fences. No explanations. No extra keys. Just the raw JSON array.

Example: if template is: printf([BLANK_0]);
  and the answer is the string "Hello", respond: ["\"Hello\""]

Now provide answers:`;
        }
        // ========== Error fix mode ==========
        else if (!prompt && errorInfo.hasError && errorInfo.currentCode) {
            // When includePrePostCode is off, wrap current code with pre/post
            const effectiveCode = wrapWithPrePost(errorInfo.currentCode);

            if (errorInfo.errorType === 'compilation_error') {
                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Fix the ${language} compilation error below. Output ONLY the corrected code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

BUGGY CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

COMPILATION ERROR:
${errorInfo.compilationError}

FIXING RULES:
1. Fix the compilation error and return a working program.
2. Keep input/output behavior compatible with the problem requirements.
3. Do NOT add extra output or debug statements.
${language.toLowerCase() === 'python' ? '4. If a function is defined (e.g. solve/main), make sure it is CALLED at the very end.' : ''}

\`\`\`${language.toLowerCase()}`;

            } else if (errorInfo.errorType === 'runtime_error') {
                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Fix the ${language} runtime error below. Output ONLY the corrected code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

BUGGY CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

RUNTIME ERROR CONTEXT:
Input:    ${errorInfo.input}
Expected: ${errorInfo.expectedOutput}
Got:      ${errorInfo.yourOutput || '(CRASH / no output)'}

FIXING STEPS:
1. Trace through the code with the given input.
2. Identify the crash source: out-of-bounds access, null pointer, division by zero, stack overflow, etc.
3. Fix the root cause without changing the correct parts of the logic.

\`\`\`${language.toLowerCase()}`;

            } else if (errorInfo.errorType === 'wrong_output') {
                const isEmptyOutput = !errorInfo.yourOutput || errorInfo.yourOutput.trim() === '' || errorInfo.yourOutput.trim() === '&nbsp;';

                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
The program produces wrong output. Rewrite it so it passes all test cases.
Output ONLY the corrected code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

CURRENT (WRONG) CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

FAILING TEST CASE:
Input:    ${errorInfo.input}
Expected: ${errorInfo.expectedOutput}
Got:      ${errorInfo.yourOutput || '(EMPTY)'}
${isEmptyOutput && language.toLowerCase() === 'python' ? '\nNOTE: Empty output likely means a function is defined but not called. Add a call at the END of the file.' : ''}

DEBUGGING STRATEGY (follow in order):
1. TRUST THE EXPECTED OUTPUT — it is the ground truth. If the problem description seems to say otherwise, ignore the description.
2. Manually trace the current code with the given Input. Confirm it really produces the wrong output.
3. Identify the bug category:
   a. Wrong formula or arithmetic?
   b. Wrong variable mapping / input order? (e.g., variables A,B,C,D assigned in wrong order)
   c. Missing step or off-by-one?
   d. Wrong operator or sign?
   e. Pattern/series problem (reverse-engineer from expected output)?
4. Fix the identified bug. Do NOT restructure the whole program unnecessarily.
5. Verify mentally with the given test case before outputting.

\`\`\`${language.toLowerCase()}`;
            }
        }
        // ========== Normal mode (no error) ==========
        else if (!prompt && problem.isTutor) {
            if (SETTINGS.includePrePostCode) {
                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack tutor problem.
Write ONLY the missing middle section of ${language} code. No imports, no main function, no comments.

PROBLEM: ${problem.title}
${problem.description}

RULES FOR TUTOR MODE:
1. Variables declared in pre-code are already available — use them directly.
2. Variables required by post-code must be computed and assigned.
3. Write ONLY the middle logic; pre-code and post-code are already provided by the system.
4. If the description conflicts with the sample output shown, trust the sample output.

\`\`\`${language.toLowerCase()}`;
            } else {
                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Write a complete, correct ${language} program that passes ALL test cases.
Output ONLY the code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

SOLVING APPROACH:
1. Carefully read all sample inputs and expected outputs given in the problem.
2. Reverse-engineer the formula or pattern from the examples if the description is unclear.
3. Handle all edge cases visible in the samples.
4. Trust sample output over problem description if they conflict.

\`\`\`${language.toLowerCase()}`;
            }
        } else if (!prompt && problem.isCodeTrack && hasPrePost) {
            if (SETTINGS.includePrePostCode) {
                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack code-track problem.
Write ONLY the missing middle ${language} code. No headers, no main declaration, no comments.

PROBLEM: ${problem.title}
${problem.description}

RULES FOR CODE-TRACK MODE:
1. Your code will be inserted DIRECTLY into the gap between pre-code and post-code. It must connect perfectly.
2. Pre-code and post-code are already provided by the system — do NOT repeat them.
3. If the post-code starts with a brace '{' or an 'else', your middle code must provide the corresponding 'if' or statement.
4. Use variables/functions from pre-code. Produce variables/results required by post-code.
5. Trust sample output over problem description if they conflict.

\`\`\`${language.toLowerCase()}`;
            } else {
                const ioHint = (language === 'C++' || language === 'C++23') ? 'Use getline() for strings with spaces.' :
                    (language === 'C') ? 'Use fgets() for strings with spaces.' : '';

                prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Write a complete, correct ${language} program that passes ALL test cases.
Output ONLY the code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}
${ioHint ? '\nI/O HINT: ' + ioHint : ''}

SOLVING APPROACH:
1. Carefully read all sample inputs and expected outputs given in the problem.
2. Reverse-engineer the formula or pattern from the examples if the description is unclear.
3. Handle all edge cases visible in the samples.
4. Trust sample output over problem description if they conflict.

\`\`\`${language.toLowerCase()}`;
            }
        } else if (!prompt && problem.isCodeTrack) {
            const ioHint = (language === 'C++' || language === 'C++23') ? 'Use getline() for strings with spaces.' :
                (language === 'C') ? 'Use fgets() for strings with spaces.' : '';

            prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Write a complete, correct ${language} program that passes ALL test cases.
Output ONLY the code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}
${ioHint ? '\nI/O HINT: ' + ioHint : ''}

SOLVING APPROACH:
1. Carefully read all sample inputs and expected outputs given in the problem.
2. Reverse-engineer the formula or pattern from the examples if the description is unclear.
3. Handle all edge cases visible in the samples.
4. Trust sample output over problem description if they conflict.

\`\`\`${language.toLowerCase()}`;
        } else if (!prompt) {
            const ioHint = (language === 'C++' || language === 'C++23') ? 'Use getline() for strings with spaces.' :
                (language === 'C') ? 'Use fgets() for strings with spaces.' : '';

            prompt = customSystemPrompt + `You are a senior competitive programmer solving a SkillRack problem.
Write a complete, correct ${language} program that passes ALL test cases.
Output ONLY the code, no explanations or comments.
${language === 'Java' ? '\nClass name must be: Hello' : ''}

PROBLEM: ${problem.title}
${problem.description}
${ioHint ? '\nI/O HINT: ' + ioHint : ''}

SOLVING APPROACH:
1. Carefully read all sample inputs and expected outputs given in the problem.
2. Reverse-engineer the formula or pattern from the examples if the description is unclear.
3. Pay attention to input variable order — SkillRack problems sometimes swap variable meanings.
4. Handle all edge cases visible in the samples.
5. Trust sample output over problem description if they conflict.

\`\`\`${language.toLowerCase()}`;
        }

        // Show loading indicator
        const aiBtn = document.getElementById('ai-solution-btn');
        if (aiBtn) {
            aiBtn.disabled = true;
            aiBtn.innerHTML = errorInfo.hasError ? 'Fixing...' : 'Generating...';
            aiBtn.style.opacity = '0.7';
        }

        try {
            const requestFromProvider = async (promptText) => {
                switch (SETTINGS.aiProvider) {
                    case 'gemini':
                        return await generateWithGemini(promptText);
                    case 'openrouter':
                        return await generateWithOpenRouter(promptText);
                    case 'puter':
                        return await generateWithPuter(promptText);
                    case 'openai':
                        return await generateWithOpenAI(promptText);
                    case 'g4f':
                        return await generateWithG4F(promptText);
                    case 'duckduckgo':
                        return await generateWithDuckDuckGo(promptText);
                    case 'yuppbridge':
                        return await generateWithYuppBridge(promptText);
                    default:
                        throw new Error(`Unknown AI provider: ${SETTINGS.aiProvider}`);
                }
            };

            let response = await requestFromProvider(prompt);

            if (problem.isMFIB) {
                let answers = [];
                try {
                    answers = JSON.parse(cleanJSONResponse(response));
                } catch (e) {
                    const arrayMatch = response.match(/\[\s*([\s\S]*?)\s*\]/);
                    if (arrayMatch) {
                        try {
                            answers = JSON.parse(arrayMatch[0]);
                        } catch (err) {
                            answers = response.split('\n').map(l => l.replace(/^[-\s*"\']+|["\',\s*]+$/g, '')).filter(Boolean);
                        }
                    }
                }

                if (Array.isArray(answers) && answers.length > 0) {
                    problem.blankInputs.forEach((input, index) => {
                        // Use the answer as-is — the AI already returns the exact
                        // text for the blank (may include quotes, semicolons, etc.)
                        const val = answers[index] !== undefined ? String(answers[index]) : '';
                        input.value = val;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`[MFIB] Blank ${index} ← "${val}"`);
                    });
                    console.log('[AutoSolver] MFIB blanks filled successfully');

                    // Sync reconstructed code to raw textarea if needed
                    const $ = window.jQuery || window.$;
                    if ($ && $("#txtCode").length) {
                        const fullCode = reconstructFullMFIBCode(problem.mfibTemplate, answers);
                        $("#txtCode").val(fullCode);
                    }
                } else {
                    notifyPopup('Failed to parse MFIB answers. Response was: ' + response);
                }
            } else {
                let code = extractCode(response, language);

                // Validate code is not empty
                if (!code || code.trim().length < 10) {
                    notifyPopup('Failed to extract valid code from AI response. Please try again.');
                    return;
                }

                // Check if code is similar to existing code
                let existingCode = '';
                if (window.txtCode && window.txtCode.getSession) {
                    existingCode = window.txtCode.getSession().getValue();
                }

                if (existingCode && calculateCodeSimilarity(code, existingCode) > 0.99) {
                    console.warn('Generated code is too similar to existing code, retrying with lenient prompt');

                    const lenientRetryPrompt = `${prompt}\n\nRETRY INSTRUCTION:\nThe previous answer was identical to the existing code. Provide a DIFFERENT corrected implementation that still follows required input/output format and solves the problem.`;

                    response = await requestFromProvider(lenientRetryPrompt);
                    code = extractCode(response, language);

                    if (!code || code.trim().length < 10) {
                        notifyPopup('Failed to extract valid code from AI retry response. Please try again.');
                        return;
                    }

                    if (calculateCodeSimilarity(code, existingCode) > 0.99) {
                        notifyPopup('⚠️ AI returned code too similar to existing code even after retry. Please try again.');
                        return;
                    }
                }

                if (code && window.txtCode) {
                    if (typeof window.txtCode.getSession === 'function') {
                        // Insert the code into ACE editor
                        window.txtCode.getSession().setValue(code);
                    } else if ('value' in window.txtCode) {
                        // Fallback for raw textarea element
                        window.txtCode.value = code;
                        window.txtCode.dispatchEvent(new Event('input', { bubbles: true }));
                        window.txtCode.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Sync with hidden textarea element in DOM
                    const $ = window.jQuery || window.$;
                    if ($ && $("#txtCode").length) {
                        $("#txtCode").val(code);
                    }

                    console.log(errorInfo.hasError ? 'AI fix applied successfully' : 'AI solution inserted successfully');
                } else {
                    notifyPopup('Failed to insert code into editor. Please try again.');
                }
            }
        } catch (error) {
            console.error('AI generation error:', error);
            notifyPopup('Error: ' + error.message);
        } finally {
            isAiGenerationInProgress = false;
            // Reset button
            if (aiBtn) {
                aiBtn.disabled = false;
                aiBtn.innerHTML = getAiButtonMarkup('AI Solution');
                aiBtn.style.opacity = '1';
            }
        }
    };


    // Add AI Solution button to the page
    const addAISolutionButton = () => {
        if (!SETTINGS.enableAISolver) return;

        // Find the button group (Save/Run buttons)
        const btnTables = document.querySelectorAll('.padtbl');
        let targetRow = null;

        // Priority 1: anchor next to Save button (standard code-track page)
        for (const table of btnTables) {
            const saveBtn = table.querySelector('button[id$="_bf"], button span');
            if (saveBtn && (saveBtn.textContent === 'Save' || saveBtn.querySelector?.('span')?.textContent === 'Save')) {
                targetRow = table.querySelector('tr');
                break;
            }
        }

        // Priority 2: find Save by button text scan
        if (!targetRow) {
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                if (btn.textContent.trim() === 'Save') {
                    targetRow = btn.closest('tr');
                    break;
                }
            }
        }

        // Priority 3: MFIB / Run-only pages — anchor next to the Run button
        if (!targetRow) {
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const spanText = btn.querySelector('span.ui-button-text')?.textContent?.trim();
                const ownText = btn.textContent.trim();
                if (spanText === 'Run' || ownText === 'Run') {
                    targetRow = btn.closest('tr') || btn.closest('.btn-group')?.parentElement;
                    break;
                }
            }
        }

        // Priority 4: fallback — inject directly after #btngrp (MFIB layout)
        if (!targetRow && document.getElementById('btngrp')) {
            const btnGrp = document.getElementById('btngrp');
            if (!document.getElementById('ai-solution-btn')) {
                const aiBtn = document.createElement('button');
                aiBtn.id = 'ai-solution-btn';
                aiBtn.type = 'button';
                aiBtn.innerHTML = getAiButtonMarkup('AI Solution');
                aiBtn.className = 'ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only ui-button-outlined';
                aiBtn.style.cssText = `
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                    color: white !important;
                    border: none !important;
                    padding: 8px 16px;
                    margin-left: 8px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                `;
                aiBtn.onmouseover = () => {
                    aiBtn.style.transform = 'scale(1.05)';
                    aiBtn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
                };
                aiBtn.onmouseout = () => {
                    aiBtn.style.transform = 'scale(1)';
                    aiBtn.style.boxShadow = 'none';
                };
                aiBtn.onclick = generateAISolution;
                btnGrp.appendChild(aiBtn);
                console.log('AI Solution button added (MFIB #btngrp fallback)');
            }
            return; // early return — button already added via fallback path
        }

        if (targetRow && !document.getElementById('ai-solution-btn')) {
            const td = document.createElement('td');
            const aiBtn = document.createElement('button');
            aiBtn.id = 'ai-solution-btn';
            aiBtn.type = 'button';
            aiBtn.innerHTML = getAiButtonMarkup('AI Solution');
            aiBtn.className = 'ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only ui-button-outlined';
            aiBtn.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                color: white !important;
                border: none !important;
                padding: 8px 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            `;
            aiBtn.onmouseover = () => {
                aiBtn.style.transform = 'scale(1.05)';
                aiBtn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
            };
            aiBtn.onmouseout = () => {
                aiBtn.style.transform = 'scale(1)';
                aiBtn.style.boxShadow = 'none';
            };
            aiBtn.onclick = generateAISolution;

            td.appendChild(aiBtn);
            targetRow.appendChild(td);

            console.log('AI Solution button added');
        }
    };

    // Initialize AI button when page is ready AND script is enabled
    onScriptEnabled(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(addAISolutionButton, 1000);
                setTimeout(addAISolutionButton, 3000);
            });
        } else {
            setTimeout(addAISolutionButton, 1000);
            setTimeout(addAISolutionButton, 3000);
        }

        // Also watch for dynamic content changes
        const aiObserver = new MutationObserver((mutations) => {
            if (!document.getElementById('ai-solution-btn')) {
                setTimeout(addAISolutionButton, 500);
            }
        });

        if (document.body) {
            aiObserver.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                aiObserver.observe(document.body, { childList: true, subtree: true });
            });
        }
    });

    // ============================================
    // 11. AUTO SOLVER - Automatic problem solving
    // ============================================

    const AutoSolver = (function () {
        'use strict';

        const CONFIG = {
            maxRetries: 5,
            genTimeout: 180000,    // 3 minutes — allows for rate-limit retries + generation time
            runTimeout: 45000,     // 45 seconds max for code execution
            resultTimeout: 45000,  // 45 seconds to wait for pass/fail result
            delayAfterGen: 1000,   // Delay after generation before clicking Run
            // Exponential backoff: base delay per attempt (capped at 30s)
            backoffBase: 3000,     // 3s on first failure
            backoffMultiplier: 2,  // doubles each retry
            backoffCap: 30000,     // 30s max
            delayBeforeNext: 2000
        };

        const STOP_PERSIST_KEY = 'autosolver_stopped';

        let isRunning = false;
        let solveInvocationActive = false;
        let shouldStop = false;
        let currentRetries = 0;
        let statusIndicator = null;
        let activeResultWaitController = null;

        // Guard: timestamp when DOM was ready (for isAllCompleted false-positive fix)
        let domReadyTime = 0;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { domReadyTime = Date.now(); });
        } else {
            domReadyTime = Date.now();
        }

        // ── Persistent stop state ────────────────────────────────────────────────
        function loadStopState() {
            try { return localStorage.getItem(STOP_PERSIST_KEY) === 'true'; } catch (e) { return false; }
        }

        function saveStopState(stopped) {
            try {
                if (stopped) localStorage.setItem(STOP_PERSIST_KEY, 'true');
                else localStorage.removeItem(STOP_PERSIST_KEY);
            } catch (e) { }
        }

        shouldStop = loadStopState();

        // ── Core helpers ─────────────────────────────────────────────────────────

        // Sleep that respects shouldStop for fast cancellation
        const sleep = ms => new Promise(r => {
            const checkInterval = setInterval(() => {
                if (shouldStop) { clearInterval(checkInterval); r(); }
            }, 100);
            setTimeout(() => { clearInterval(checkInterval); r(); }, ms);
        });

        function checkStop() {
            if (shouldStop) throw new Error('STOPPED_BY_USER');
        }

        // Wait for a DOM element to become visible
        async function waitFor(selector, timeout = 15000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                if (shouldStop) return null;
                const el = document.querySelector(selector);
                if (el && el.offsetParent !== null) return el;
                await sleep(50);
            }
            return null;
        }

        // Single-event click (avoids triple-submission)
        function forceClick(el, name) {
            if (!el) { console.warn(`[AutoSolver] ${name} not found`); return false; }
            try {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                console.log(`[AutoSolver] Clicked: ${name}`);
                return true;
            } catch (e) {
                console.error(`[AutoSolver] Click failed: ${name}`, e);
                return false;
            }
        }

        function hasText(selector, text) {
            const el = document.querySelector(selector);
            return el && el.innerText && el.innerText.toLowerCase().includes(text.toLowerCase());
        }

        // ── Exponential backoff helper ────────────────────────────────────────────
        // Returns backoff delay (ms) for the given attempt number (0-indexed)
        function getBackoffDelay(attemptIndex) {
            const delay = CONFIG.backoffBase * Math.pow(CONFIG.backoffMultiplier, attemptIndex);
            return Math.min(delay, CONFIG.backoffCap);
        }

        function createResultWaitController() {
            if (activeResultWaitController) {
                try { activeResultWaitController.abort(); } catch (e) { }
            }
            activeResultWaitController = new AbortController();
            return activeResultWaitController;
        }

        function abortResultWait() {
            if (!activeResultWaitController) return;
            try { activeResultWaitController.abort(); } catch (e) { }
            activeResultWaitController = null;
        }

        // Sleep with a live countdown shown in the status popup
        async function sleepWithCountdown(ms, label) {
            console.log(`[AutoSolver] Backoff ${ms}ms (${label}) at ${new Date().toISOString()}`);
            const steps = Math.ceil(ms / 1000);
            for (let i = steps; i > 0; i--) {
                if (shouldStop) return;
                updateStatus(`Retrying in ${i}s... ${label}`, 'warning');
                await sleep(1000);
            }
        }

        function readResultCards() {
            const out = { input: '', expected: '', actual: '' };
            const panelContent = document.getElementById('errormsg_content') || document.getElementById('errormsg');
            if (!panelContent) return out;
            const cards = panelContent.querySelectorAll('.ui-card-content');
            const labels = panelContent.querySelectorAll('.ui.label');
            labels.forEach((label, index) => {
                const key = (label.textContent || '').toLowerCase();
                let value = '';
                const siblingCard = label.parentElement?.querySelector('.ui-card-content');
                if (siblingCard) {
                    value = (siblingCard.textContent || '').trim();
                } else {
                    value = (cards[index]?.textContent || '').trim();
                }
                if (key.includes('input')) out.input = value;
                else if (key.includes('expected')) out.expected = value;
                else if (key.includes('your program') || key.includes('your output')) out.actual = value;
            });
            return out;
        }

        function buildRetryContext(resultType) {
            const errEl = document.getElementById('errormsg');
            const panelContent = document.getElementById('errormsg_content') || errEl;
            const rawError = (panelContent?.textContent || errEl?.textContent || '').trim();
            const cards = readResultCards();

            if (resultType === 'compilation_error') {
                const lines = rawError.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 10);
                return {
                    retryType: 'compilation_error',
                    label: 'compilation error',
                    contextText: lines.join('\n') || rawError
                };
            }

            if (resultType === 'runtime_error') {
                const lines = rawError.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 8);
                const runtimeText = lines.join('\n') || rawError;
                const ioBlock = [
                    cards.input ? `Input: ${cards.input}` : '',
                    cards.expected ? `Expected: ${cards.expected}` : '',
                    cards.actual ? `Actual: ${cards.actual}` : ''
                ].filter(Boolean).join('\n');
                return {
                    retryType: 'runtime_error',
                    label: 'runtime error',
                    contextText: ioBlock ? `${runtimeText}\n${ioBlock}` : runtimeText
                };
            }

            if (resultType === 'failed') {
                const wrongOutputText = [
                    cards.input ? `Input: ${cards.input}` : '',
                    cards.expected ? `Expected Output: ${cards.expected}` : '',
                    `Actual Output: ${cards.actual || '(EMPTY)'}`
                ].filter(Boolean).join('\n');
                return {
                    retryType: 'wrong_output',
                    label: 'wrong output',
                    contextText: wrongOutputText || rawError
                };
            }

            return {
                retryType: 'timeout',
                label: 'timeout',
                contextText: ''
            };
        }

        function clearInjectedRetryContext() {
            const aiBtn = document.getElementById('ai-solution-btn');
            if (aiBtn?.dataset) {
                delete aiBtn.dataset.autoSolverRetryType;
                delete aiBtn.dataset.autoSolverContext;
            }
            const injected = document.querySelector('#errormsg_content [data-autosolver-context], #errormsg [data-autosolver-context]');
            if (injected) injected.remove();
        }

        function injectRetryContext(resultType) {
            const ctx = buildRetryContext(resultType);
            clearInjectedRetryContext();

            if (!ctx.contextText || resultType === 'timeout') return ctx;

            const aiBtn = document.getElementById('ai-solution-btn');
            if (aiBtn?.dataset) {
                aiBtn.dataset.autoSolverRetryType = ctx.retryType;
                aiBtn.dataset.autoSolverContext = ctx.contextText.slice(0, 4000);
            }

            const panelContent = document.getElementById('errormsg_content') || document.getElementById('errormsg');
            if (panelContent) {
                const marker = document.createElement('div');
                marker.setAttribute('data-autosolver-context', '1');
                marker.style.display = 'none';
                marker.textContent = `AutoSolver retry context (${ctx.retryType}):\n${ctx.contextText}`;
                panelContent.appendChild(marker);
            }

            return ctx;
        }

        // ── Error DOM helper ─────────────────────────────────────────────────────
        // Wait up to maxWait ms for the #errormsg panel to be populated after Run
        async function waitForErrorDOMToSettle(maxWait = 3000) {
            const deadline = Date.now() + maxWait;
            while (Date.now() < deadline && !shouldStop) {
                const el = document.querySelector('#errormsg');
                if (el && el.innerText && el.innerText.trim().length > 0) return;
                await sleep(100);
            }
        }

        // Extract a short error summary for status display from #errormsg
        function extractErrorSummary() {
            const el = document.querySelector('#errormsg');
            if (!el) return '';
            const text = el.innerText || '';
            // First non-blank line, capped at 60 chars
            const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
            return firstLine.trim().slice(0, 60);
        }

        // ── Clear stale results ───────────────────────────────────────────────────
        function clearPreviousResults() {
            try {
                const successEl = document.querySelector('#successmsg');
                if (successEl) successEl.innerHTML = '';
                const errorEl = document.querySelector('#errormsg');
                if (errorEl) errorEl.innerHTML = '';
                document.querySelectorAll('.ui-growl-item-container').forEach(el => el.remove());
                console.log('[AutoSolver] Cleared previous results');
            } catch (e) {
                console.error('[AutoSolver] Error clearing results:', e);
            }
        }

        // ── Proceed Next ─────────────────────────────────────────────────────────
        async function clickProceedNext() {
            updateStatus('Looking for Proceed Next...', 'info');

            const findProceedNextButton = () => {
                let btn = document.querySelector('#j_id_9i');
                if (btn) return btn;
                btn = document.querySelector('button[id*="_9i"], a[id*="_9i"], input[id*="_9i"]');
                if (btn) return btn;
                const candidates = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
                for (const el of candidates) {
                    const span = el.querySelector?.('span.ui-button-text');
                    const text = `${(span?.textContent || '')} ${(el.textContent || '')} ${(el.value || '')}`.toLowerCase();
                    if (text.includes('proceed next') || text.includes('proceed to next') || text.includes('next')) {
                        return el;
                    }
                }
                return null;
            };

            let nextBtn = null;
            const maxWaitMs = 12000;
            const waitStart = Date.now();
            while (!nextBtn && (Date.now() - waitStart) < maxWaitMs) {
                if (shouldStop) return false;
                nextBtn = findProceedNextButton();
                if (!nextBtn) await sleep(200);
            }

            if (!nextBtn) {
                console.log('[AutoSolver] Proceed Next button not found');
                updateStatus('Proceed Next not found', 'warning');
                return false;
            }

            console.log('[AutoSolver] Found Proceed Next button:', nextBtn.id || nextBtn.className);
            updateStatus('Clicking Proceed Next...', 'info');

            // Single dispatchEvent click — avoids triple-submission
            try {
                nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                console.log('[AutoSolver] Clicked: Proceed Next');
                updateStatus('Moving to next...', 'info');
            } catch (e) {
                console.error('[AutoSolver] Click failed: Proceed Next', e);
                return false;
            }

            await sleep(3000);
            if (!shouldStop) setTimeout(() => solve(), 2000);
            return true;
        }

        // ── Status indicator ─────────────────────────────────────────────────────
        let stopButton = null;
        let statusText = null;

        function updateStatus(message, type = 'info') {
            console.log(`[AutoSolver] ${message}`);
            if (!SETTINGS.enablePopupMode) return;
            if (statusIndicator) {
                const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#f44336' };
                statusIndicator.style.background = colors[type] || colors.info;
                if (statusText) statusText.textContent = `Auto Solver: ${message}`;
            }
        }

        function createStatusIndicator() {
            if (!SETTINGS.enablePopupMode) return;
            if (statusIndicator) return;

            statusIndicator = document.createElement('div');
            statusIndicator.id = 'auto-solver-status';
            statusIndicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                padding: 10px 16px;
                background: #2196F3;
                color: white;
                border-radius: 8px;
                font-family: 'VT323', monospace;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                display: none;
                align-items: center;
                gap: 10px;
            `;

            statusText = document.createElement('span');
            statusText.id = 'auto-solver-text';
            statusText.textContent = 'Auto Solver: Initializing...';
            statusIndicator.appendChild(statusText);

            stopButton = document.createElement('button');
            stopButton.id = 'auto-solver-stop';
            stopButton.textContent = 'STOP';
            stopButton.style.cssText = `
                background: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                margin-left: 8px;
                transition: background 0.2s;
            `;
            stopButton.addEventListener('mouseover', () => { stopButton.style.background = '#d32f2f'; });
            stopButton.addEventListener('mouseout', () => { stopButton.style.background = '#f44336'; });
            stopButton.addEventListener('click', () => {
                stop();
                updateStatus('Stopped by user', 'warning');
                setTimeout(hideStatus, 2000);
            });
            statusIndicator.appendChild(stopButton);

            if (document.body) {
                document.body.appendChild(statusIndicator);
            } else {
                document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(statusIndicator); });
            }
        }

        function showStatus() {
            if (!SETTINGS.enablePopupMode) return;
            if (statusIndicator) statusIndicator.style.display = 'flex';
        }

        function hideStatus() {
            if (!SETTINGS.enablePopupMode) return;
            if (statusIndicator) statusIndicator.style.display = 'none';
        }

        // ── AI Generation wait ────────────────────────────────────────────────────
        async function waitForAIGeneration() {
            const start = Date.now();
            updateStatus('Generating solution...', 'info');

            // Phase 1: Wait up to 5s for generation to actually start
            let started = false;
            const startCheckDeadline = Date.now() + 5000;
            while (Date.now() < startCheckDeadline) {
                if (shouldStop) return false;
                const btn = document.querySelector('#ai-solution-btn');
                if (btn) {
                    const text = btn.innerText || btn.textContent || '';
                    const isDisabled = btn.disabled || btn.hasAttribute('disabled');
                    const opacity = parseFloat(btn.style.opacity || '1');
                    if (text.includes('Generating') || text.includes('Fixing') || text.includes('Rate limited') || text.includes('fallback') || isDisabled || opacity < 1) {
                        started = true;
                        break;
                    }
                }
                await sleep(100);
            }

            if (!started) {
                console.warn('[AutoSolver] Generation did not start within 5s');
                await sleep(3000);
                return false;
            }

            // Phase 2: Wait for generation to complete
            while (Date.now() - start < CONFIG.genTimeout) {
                if (shouldStop) return false;
                const btn = document.querySelector('#ai-solution-btn');
                if (btn) {
                    const text = btn.innerText || btn.textContent || '';
                    const isDisabled = btn.disabled || btn.hasAttribute('disabled');
                    const opacity = parseFloat(btn.style.opacity || '1');

                    if (text.includes('Rate limited') || text.includes('fallback')) {
                        updateStatus(text, 'warning');
                    } else if (text.includes('Generating') || text.includes('Fixing')) {
                        updateStatus('Generating solution...', 'info');
                    }

                    if (text.includes('Generating') || text.includes('Fixing') || text.includes('Rate limited') || text.includes('fallback') || isDisabled || opacity < 1) {
                        await sleep(300);
                        if (shouldStop) return false;
                        continue;
                    }
                    return true;
                }
                await sleep(300);
                if (shouldStop) return false;
            }

            updateStatus('Generation timeout!', 'warning');
            return false;
        }

        // ── Result detection ──────────────────────────────────────────────────────
        // Improved: also checks PrimeFaces growl messages and URL change as success signals
        async function waitForResult(signal) {
            const start = Date.now();
            const initialUrl = window.location.href;
            updateStatus('Waiting for result...', 'info');

            const detectResult = async () => {
                while (Date.now() - start < CONFIG.resultTimeout) {
                    if (shouldStop) return 'stopped';
                    if (signal?.aborted) return 'stopped';

                    // URL changed → SkillRack navigated to next problem (treat as success)
                    if (window.location.href !== initialUrl) {
                        console.log('[AutoSolver] URL changed — treating as success');
                        return 'success';
                    }

                    // Standard success/error elements
                    if (hasText('#successmsg', 'passed') || hasText('.ui-panel-title', 'passed')) return 'success';
                    if (hasText('#errormsg', 'error:') || hasText('#errormsg', 'compilation')) return 'compilation_error';
                    if (hasText('#errormsg', 'segmentation') || hasText('#errormsg', 'runtime')) return 'runtime_error';
                    if (hasText('#errormsg', 'did not pass') || hasText('#errormsg', 'wrong') || hasText('#errormsg', 'execution')) return 'failed';

                    // PrimeFaces growl messages (fallback when errormsg is absent)
                    const growlItems = document.querySelectorAll('.ui-growl-item-container, .ui-growl-item');
                    for (const g of growlItems) {
                        const gt = (g.innerText || '').toLowerCase();
                        if (gt.includes('pass') || gt.includes('success') || gt.includes('correct')) return 'success';
                        if (gt.includes('error') || gt.includes('fail') || gt.includes('wrong')) return 'failed';
                    }

                    await sleep(100);
                }

                return 'timeout';
            };

            if (!signal) return detectResult();

            const aborted = new Promise(resolve => {
                if (signal.aborted) resolve('stopped');
                signal.addEventListener('abort', () => resolve('stopped'), { once: true });
            });

            return Promise.race([detectResult(), aborted]);
        }

        // ── Page detection helpers ────────────────────────────────────────────────
        function isOnProblemPageURL() {
            const href = window.location.href;
            if (href.includes('codeprogram') || href.includes('tutorprogram')) return true;
            return hasCodeEditor() || hasCaptcha() || isOnProblemListPage();
        }

        function isOnProblemListPage() {
            const spans = document.querySelectorAll('button span.ui-button-text');
            for (const span of spans) {
                if (span.textContent === 'Solve') return true;
            }
            return false;
        }

        function isOnCodingPage() {
            return hasCodeEditor() || hasCaptcha();
        }

        function hasCaptcha() {
            const captchaInput = document.getElementById('capval');
            const proceedBtn = document.getElementById('proceedbtn');
            if (!captchaInput || !proceedBtn) return false;
            const isVisible = (el) => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none';
            return isVisible(captchaInput) && isVisible(proceedBtn);
        }

        function hasCodeEditor() {
            if (document.getElementById('txtCode') !== null) return true;
            if (document.querySelector('.ace_editor') !== null) return true;
            return extractMFIBTemplate().inputs.length > 0;
        }

        // ── Main solve function ───────────────────────────────────────────────────
        async function solve() {
            if (!SETTINGS.enableAutoSolver || !SETTINGS.enableAISolver) {
                console.log('[AutoSolver] Disabled in settings');
                return false;
            }
            if (loadStopState()) {
                console.log('[AutoSolver] Persistent stop active - not solving');
                return false;
            }

            shouldStop = false;
            saveStopState(false);

            if (isRunning || solveInvocationActive) {
                console.log('[AutoSolver] Already running');
                return false;
            }
            solveInvocationActive = true;

            if (!isOnProblemPageURL()) {
                console.log('[AutoSolver] Not on a problem page URL');
                solveInvocationActive = false;
                return false;
            }

            createStatusIndicator();
            showStatus();
            updateStatus('Analyzing page...', 'info');

            // On problem LIST page — click Solve first
            if (isOnProblemListPage() && !isOnCodingPage()) {
                updateStatus('Finding Solve button...', 'info');
                console.log('[AutoSolver] On problem list page - looking for Solve button...');
                const solveButtons = document.querySelectorAll('button');
                for (const btn of solveButtons) {
                    if (shouldStop) { updateStatus('Stopped', 'warning'); setTimeout(hideStatus, 2000); solveInvocationActive = false; return false; }
                    const span = btn.querySelector('span.ui-button-text');
                    if (span && span.textContent === 'Solve') {
                        console.log('[AutoSolver] Found Solve button, clicking...');
                        updateStatus('Clicking Solve...', 'info');
                        forceClick(btn, 'Solve Problem');
                        await sleep(3000);
                        if (shouldStop) { hideStatus(); solveInvocationActive = false; return false; }
                        hideStatus();
                        if (!shouldStop) setTimeout(() => solve(), 2000);
                        solveInvocationActive = false;
                        return true;
                    }
                }
                console.log('[AutoSolver] No Solve button found on list page');
                updateStatus('No Solve button found', 'warning');
                setTimeout(hideStatus, 3000);
                solveInvocationActive = false;
                return false;
            }

            // Wait for captcha to be solved
            if (hasCaptcha()) {
                updateStatus('Waiting for captcha...', 'info');
                console.log('[AutoSolver] Captcha detected, waiting for it to be solved...');
                let waitTime = 0;
                const maxWait = 60000;
                while (hasCaptcha() && waitTime < maxWait && !shouldStop) {
                    await sleep(1000);
                    waitTime += 1000;
                    if (waitTime % 5000 === 0) {
                        updateStatus(`Captcha... (${waitTime / 1000}s)`, 'info');
                        console.log(`[AutoSolver] Still waiting for captcha... (${waitTime / 1000}s)`);
                    }
                }
                if (shouldStop) { updateStatus('Stopped', 'warning'); setTimeout(hideStatus, 2000); solveInvocationActive = false; return false; }
                if (hasCaptcha()) {
                    console.log('[AutoSolver] Captcha still present after 60s, aborting');
                    updateStatus('Captcha timeout!', 'error');
                    setTimeout(hideStatus, 3000);
                    solveInvocationActive = false;
                    return false;
                }
                console.log('[AutoSolver] Captcha solved! Continuing...');
                updateStatus('Captcha solved!', 'success');
                await sleep(1000);
                if (shouldStop) { updateStatus('Stopped', 'warning'); setTimeout(hideStatus, 2000); solveInvocationActive = false; return false; }
            }

            // Wait for code editor
            if (!hasCodeEditor()) {
                updateStatus('Waiting for editor...', 'info');
                console.log('[AutoSolver] Code editor not found, waiting...');
                await sleep(3000);
                if (shouldStop) { updateStatus('Stopped', 'warning'); setTimeout(hideStatus, 2000); solveInvocationActive = false; return false; }
                if (!hasCodeEditor()) {
                    console.log('[AutoSolver] Code editor still not found, aborting');
                    updateStatus('Editor not found', 'error');
                    setTimeout(hideStatus, 3000);
                    solveInvocationActive = false;
                    return false;
                }
            }

            isRunning = true;
            shouldStop = false;
            currentRetries = 0;

            try {
                return await runSolveLoop();
            } catch (e) {
                if (e.message === 'STOPPED_BY_USER') {
                    console.log('[AutoSolver] Stopped by user');
                    updateStatus('Stopped', 'warning');
                } else {
                    console.error('[AutoSolver] Error:', e);
                    updateStatus('Error occurred!', 'error');
                }
                return false;
            } finally {
                isRunning = false;
                solveInvocationActive = false;
                setTimeout(hideStatus, 3000);
            }
        }

        // ── Main solve loop with exponential backoff ──────────────────────────────
        async function runSolveLoop() {
            const maxRetries = SETTINGS.autoSolverMaxRetries || CONFIG.maxRetries;

            while (currentRetries < maxRetries && !shouldStop) {
                checkStop();

                const attemptLabel = `Attempt ${currentRetries + 1}/${maxRetries}`;
                updateStatus(attemptLabel, 'info');

                // Step 1: Click AI Solution button
                clearInjectedRetryContext();
                // On retry, the error DOM still reflects the PREVIOUS run at this point.
                // getErrorInfo() (called inside the AI button handler) will read it correctly
                // because clearPreviousResults() and waitForResult() haven't run yet on this
                // retry — the stale error IS the context we want to inject.

                await sleep(500);
                checkStop();

                const aiBtn = await waitFor('#ai-solution-btn', 5000);
                checkStop();
                if (!aiBtn) { updateStatus('AI button not found', 'error'); return false; }

                forceClick(aiBtn, 'AI Solution');

                // Step 2: Wait for AI generation to complete
                const generated = await waitForAIGeneration();
                checkStop();
                if (!generated) {
                    currentRetries++;
                    const backoff = getBackoffDelay(currentRetries - 1);
                    await sleepWithCountdown(backoff, `Gen failed — retry ${currentRetries}/${maxRetries}`);
                    checkStop();
                    continue;
                }

                updateStatus('Solution generated!', 'success');
                await sleep(SETTINGS.autoSolverDelay || CONFIG.delayAfterGen);
                checkStop();

                // Step 3: Click Run button
                clearPreviousResults();
                const runBtn = await waitFor('#j_id_bg, button[id*="_bg"]', 5000);
                checkStop();

                if (!runBtn) {
                    // Fallback: find Run button by text
                    let foundRun = false;
                    for (const btn of document.querySelectorAll('button')) {
                        if (btn.textContent.includes('Run')) {
                            forceClick(btn, 'Run');
                            foundRun = true;
                            break;
                        }
                    }
                    if (!foundRun) { updateStatus('Run button not found', 'error'); return false; }
                } else {
                    forceClick(runBtn, 'Run');
                }

                // Step 4: Wait for result
                const resultController = createResultWaitController();
                const result = await waitForResult(resultController.signal);
                if (activeResultWaitController === resultController) {
                    activeResultWaitController = null;
                }
                if (shouldStop || result === 'stopped') throw new Error('STOPPED_BY_USER');

                // Step 5: Handle result with error-type-aware status
                if (result === 'success') {
                    clearInjectedRetryContext();
                    updateStatus('PASSED ✓', 'success');
                    await sleep(CONFIG.delayBeforeNext);
                    checkStop();

                    const movedNext = await clickProceedNext();
                    if (movedNext) return true;

                    // Proceed Next failed — retry
                    currentRetries++;
                    const backoff = getBackoffDelay(currentRetries - 1);
                    await sleepWithCountdown(backoff, `Next click failed — retry ${currentRetries}/${maxRetries}`);
                    checkStop();
                    continue;

                } else if (result === 'failed' || result === 'compilation_error' || result === 'runtime_error') {
                    currentRetries++;
                    // Wait for error DOM to settle so we get the full message for status display
                    await waitForErrorDOMToSettle(2000);
                    const injectedContext = injectRetryContext(result);
                    const errorSummary = extractErrorSummary() || injectedContext.contextText.split('\n')[0] || '';
                    const errorLabel = injectedContext.label;

                    const backoff = getBackoffDelay(currentRetries - 1);
                    const statusMsg = errorSummary
                        ? `Retry ${currentRetries}/${maxRetries} — ${errorLabel}: ${errorSummary}`
                        : `Retry ${currentRetries}/${maxRetries} — ${errorLabel}`;

                    console.log(`[AutoSolver] ${statusMsg}`);
                    updateStatus(statusMsg, 'warning');
                    // sleepWithCountdown shows countdown in status popup
                    await sleepWithCountdown(backoff, statusMsg);
                    checkStop();
                    // Loop continues — getErrorInfo() on next iteration reads the error from DOM
                    continue;

                } else {
                    // timeout or unknown
                    currentRetries++;
                    clearInjectedRetryContext();
                    const backoff = getBackoffDelay(currentRetries - 1);
                    await sleepWithCountdown(backoff, `Retry ${currentRetries}/${maxRetries} — timeout`);
                    checkStop();
                    continue;
                }
            }

            updateStatus(`Failed after ${maxRetries} attempts`, 'error');
            return false;
        }

        // ── Stop / Resume ─────────────────────────────────────────────────────────
        function stop() {
            abortResultWait();
            clearInjectedRetryContext();
            shouldStop = true;
            isRunning = false;
            saveStopState(true);
            console.log('[AutoSolver] Stop requested (persistent)');
            updateStatus('Stopping...', 'warning');
            setTimeout(() => { hideStatus(); console.log('[AutoSolver] Stopped'); }, 1000);
        }

        function resume() {
            shouldStop = false;
            saveStopState(false);
            console.log('[AutoSolver] Resumed');
        }

        // ── Consecutive failure tracking ──────────────────────────────────────────
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 3;
        let lastSolveAttempt = 0;
        const MIN_SOLVE_INTERVAL = 5000;

        // ── Completion check ──────────────────────────────────────────────────────
        // Guard: do not fire within 500ms of DOMContentLoaded to avoid false-positives
        function isAllCompleted() {
            if (Date.now() - domReadyTime < 500) return false;
            const pageText = document.body?.innerText || '';
            if (pageText.includes('Congratulations') ||
                pageText.includes('All problems completed') ||
                pageText.includes('completed all')) {
                return true;
            }
            const hasSolveBtn = isOnProblemListPage();
            const hasEditor = hasCodeEditor();
            const hasCaptchaPage = hasCaptcha();
            return !hasSolveBtn && !hasEditor && !hasCaptchaPage;
        }

        // ── Init ──────────────────────────────────────────────────────────────────
        function init() {
            if (!SETTINGS.enableAutoSolver || !SETTINGS.enableAISolver) return;

            console.log('[AutoSolver] Starting...');

            if (loadStopState()) {
                console.log('[AutoSolver] Persistent stop detected - not auto-starting');
                createStatusIndicator();
                showStatus();
                updateStatus('Stopped (click to resume)', 'warning');

                if (stopButton) {
                    stopButton.textContent = 'RESUME';
                    stopButton.style.background = '#4CAF50';
                    stopButton.onclick = () => {
                        resume();
                        stopButton.textContent = 'STOP';
                        stopButton.style.background = '#f44336';
                        stopButton.onclick = () => { stop(); updateStatus('Stopped by user', 'warning'); setTimeout(hideStatus, 2000); };
                        updateStatus('Resumed!', 'success');
                        setTimeout(() => { if (isOnProblemPageURL()) solve(); }, 1000);
                    };
                }
                return;
            }

            if (isOnProblemPageURL()) {
                console.log('[AutoSolver] On problem page, starting auto-solve...');
                solve();
            }

            // Debounced solve trigger
            let solveTimeout = null;
            const debouncedSolve = () => {
                if (solveTimeout) clearTimeout(solveTimeout);
                solveTimeout = setTimeout(() => {
                    const now = Date.now();
                    if (now - lastSolveAttempt < MIN_SOLVE_INTERVAL) return;
                    if (isAllCompleted()) {
                        console.log('[AutoSolver] All problems completed!');
                        updateStatus('All completed', 'success');
                        setTimeout(hideStatus, 5000);
                        return;
                    }
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        console.log('[AutoSolver] Too many failures, stopping');
                        updateStatus('Stopped - too many failures', 'error');
                        setTimeout(hideStatus, 5000);
                        return;
                    }
                    if (isOnProblemPageURL() && !isRunning) {
                        lastSolveAttempt = now;
                        solve().then(ok => {
                            if (ok) consecutiveFailures = 0;
                            else consecutiveFailures++;
                        }).catch(() => { consecutiveFailures++; });
                    }
                }, 1000);
            };

            // Throttled MutationObserver — max once per 2s
            let lastObserverTrigger = 0;
            const navObserver = new MutationObserver(() => {
                const now = Date.now();
                if (now - lastObserverTrigger < 2000) return;
                lastObserverTrigger = now;
                if (isOnProblemPageURL() && !isRunning) debouncedSolve();
            });

            if (document.body) {
                navObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        return {
            solve,
            stop,
            init,
            isRunning: () => isRunning,
            resetFailures: () => { consecutiveFailures = 0; }
        };
    })();

    // Initialize Auto Solver when DOM is ready AND script is enabled
    onScriptEnabled(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(AutoSolver.init, 500);
            });
        } else {
            setTimeout(AutoSolver.init, 300);
        }

        // Expose for manual control
        window.AutoSolver = AutoSolver;
    });

    // ============================================
    // 12. FIND INCOMPLETE MODULE
    // Scans viewsolved.xhtml for started-but-incomplete parts,
    // navigates to the lowest-ratio one, optionally triggers AutoSolver.
    // ============================================
    const FindIncompleteModule = (function () {
        'use strict';

        // ── State Machine ────────────────────────────────────────────────────
        const STATE = Object.freeze({
            IDLE: 'IDLE',
            SCANNING: 'SCANNING',
            NAVIGATING: 'NAVIGATING',
            COMPLETE: 'COMPLETE',
            ERROR: 'ERROR'
        });
        let currentState = STATE.IDLE;
        let activeController = null;

        // ── JSF ViewState & Sequential Request Queue ─────────────────────────
        let currentViewState = null;
        let queuePromise = Promise.resolve();

        function enqueueRequest(fn) {
            // Keep the chain alive by catching errors for the next link,
            // but return the actual promise (which can reject) to the caller.
            const nextLink = queuePromise.then(
                () => fn(),
                () => fn()
            );
            queuePromise = nextLink.catch(() => {});
            return nextLink;
        }

        async function queuedFetch(url, options = {}, retries = 2, delay = 1000) {
            const signal = activeController ? activeController.signal : null;
            if (signal && signal.aborted) throw new Error('Cancelled');

            return enqueueRequest(async () => {
                if (signal && signal.aborted) throw new Error('Cancelled');

                // Rate-limiting delay: 300-500ms
                await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

                if (signal && signal.aborted) throw new Error('Cancelled');

                // Pre-populate ViewState if POST and currentViewState is null
                if (options.method === 'POST' && !currentViewState) {
                    console.log("No active ViewState found for POST. Fetching clean URL first...");
                    try {
                        const cleanUrl = url.split('#')[0].split('?')[0];
                        const initHtml = await fetchWithTimeout(cleanUrl, { method: 'GET', credentials: 'include' });
                        const initialState = extractViewState(initHtml);
                        if (initialState) currentViewState = initialState;
                    } catch (err) {
                        console.error("Failed to initialize ViewState:", err);
                    }
                }

                // Inject ViewState in POST body if not already present
                if (options.method === 'POST') {
                    let bodyParams = new URLSearchParams(options.body || '');
                    if (!bodyParams.has('jakarta.faces.ViewState')) {
                        bodyParams.set('jakarta.faces.ViewState', currentViewState || '');
                    }
                    options.body = bodyParams.toString();
                    options.headers = options.headers || {};
                    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }

                let html;
                let attempt = 0;
                while (true) {
                    if (signal && signal.aborted) throw new Error('Cancelled');
                    try {
                        html = await fetchWithTimeout(url, options);
                        break;
                    } catch (err) {
                        attempt++;
                        if (attempt > retries) {
                            throw new Error(`Failed to fetch ${url} after ${retries} retries: ${err.message}`);
                        }
                        const backoff = delay * Math.pow(2, attempt - 1);
                        console.warn(`Fetch error on ${url}. Retrying in ${backoff}ms:`, err);
                        await new Promise(r => setTimeout(r, backoff));
                    }
                }

                // Parse and update ViewState
                const nextState = extractViewState(html);
                if (nextState) currentViewState = nextState;

                // Check for ViewExpiredException
                if (html.includes('ViewExpiredException') || html.includes('viewExpired') || html.includes('javax.faces.application.ViewExpiredException')) {
                    console.warn(`ViewExpiredException detected on ${url}. Fetching fresh ViewState from the same page...`);
                    const cleanUrl = url.split('#')[0];
                    const freshHtml = await fetchWithTimeout(cleanUrl, { method: 'GET', credentials: 'include' });
                    const freshState = extractViewState(freshHtml);
                    if (freshState) {
                        currentViewState = freshState;
                        console.log("Got fresh ViewState. Retrying original request...");
                        
                        if (options.method === 'POST') {
                            let bodyParams = new URLSearchParams(options.body || '');
                            bodyParams.set('jakarta.faces.ViewState', freshState);
                            options.body = bodyParams.toString();
                        }
                        
                        return queuedFetch(url, options, retries, delay);
                    }
                    throw new Error("JSF session expired and could not be restored.");
                }

                return html;
            });
        }

        async function fetchWithTimeout(url, options = {}, timeout = 10000) {
            const signal = activeController ? activeController.signal : null;
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            
            const cleanupObj = {};
            const combinedSignal = signal ? createCombinedSignal([signal, controller.signal], cleanupObj) : controller.signal;

            try {
                const res = await fetch(url, {
                    ...options,
                    signal: combinedSignal,
                    credentials: 'include'
                });
                clearTimeout(id);
                if (cleanupObj.cleanup) cleanupObj.cleanup();
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            } catch (err) {
                clearTimeout(id);
                if (cleanupObj.cleanup) cleanupObj.cleanup();
                throw err;
            }
        }

        // Helper functions
        function createCombinedSignal(signals, cleanupObj = {}) {
            const ctrl = new AbortController();
            const abort = () => ctrl.abort();
            const activeSignals = signals.filter(Boolean);
            activeSignals.forEach(s => s.addEventListener('abort', abort));
            
            cleanupObj.cleanup = () => {
                activeSignals.forEach(s => s.removeEventListener('abort', abort));
            };
            
            return ctrl.signal;
        }

        function extractViewState(html) {
            try {
                if (html.includes('<partial-response>')) {
                    const xmlDoc = new DOMParser().parseFromString(html, 'text/xml');
                    const updates = xmlDoc.querySelectorAll('update');
                    for (const upd of updates) {
                        if (upd.getAttribute('id') === 'jakarta.faces.ViewState') {
                            return upd.textContent;
                        }
                    }
                }
            } catch (_) {}
            try {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const el = doc.querySelector('input[name="jakarta.faces.ViewState"]');
                if (el) return el.value;
            } catch (_) {}
            const m = html.match(/jakarta\.faces\.ViewState.*?value="([^"]+)"/) || html.match(/value="([^"]+)".*?jakarta\.faces\.ViewState/);
            if (m) return m[1];
            
            const xmlMatch = html.match(/<update[^>]*id="jakarta\.faces\.ViewState"[^>]*><!\[CDATA\[([^\]]+)\]\]><\/update>/) || html.match(/id="jakarta\.faces\.ViewState"[^>]*><!\[CDATA\[([^\]]+)\]\]>/);
            return xmlMatch ? xmlMatch[1] : null;
        }

        // ── Storage Wrapper ──────────────────────────────────────────────────
        const storage = {
            getValue(key, def) {
                try {
                    if (typeof GM_getValue !== 'undefined') {
                        return GM_getValue(key, def);
                    }
                } catch (_) {}
                const val = localStorage.getItem(key);
                return val !== null ? val : def;
            },
            setValue(key, value) {
                try {
                    if (typeof GM_setValue !== 'undefined') {
                        GM_setValue(key, value);
                        return;
                    }
                } catch (_) {}
                localStorage.setItem(key, value);
            },
            deleteValue(key) {
                try {
                    if (typeof GM_deleteValue !== 'undefined') {
                        GM_deleteValue(key);
                        return;
                    }
                } catch (_) {}
                localStorage.removeItem(key);
            }
        };

        // ── Daily-skip patterns ──────────────────────────────────────────────
        const SKIP_PATTERNS = [/daily\s*challenge/i, /daily\s*test/i, /daily\s*quiz/i];

        function shouldSkipTitle(title) {
            return SKIP_PATTERNS.some(p => p.test(title));
        }

        // ── Parsing Helpers ──────────────────────────────────────────────────
        function parseViewSolved(rawText) {
            let tableHtml = rawText;
            if (rawText.trimStart().startsWith('<?xml') || rawText.includes('<partial-response>')) {
                tableHtml = extractFromPartialResponse(rawText);
            }
            const doc = new DOMParser().parseFromString(tableHtml, 'text/html');
            const tbody = doc.getElementById('solcnt:tbl_data') ||
                          doc.querySelector('[id$="tbl_data"]') ||
                          doc.querySelector('.ui-datatable-data');
            if (!tbody) return [];

            // Row count verification
            let expectedRowCount = 0;
            const scripts = doc.querySelectorAll('script');
            for (const s of scripts) {
                const m = s.textContent.match(/rowCount\s*:\s*(\d+)/i);
                if (m) {
                    expectedRowCount = parseInt(m[1], 10);
                    break;
                }
            }

            const results = [];
            const trs = tbody.querySelectorAll('tr[data-ri]');
            trs.forEach(tr => {
                const cells = tr.querySelectorAll('td');
                if (cells.length < 3) return;
                const title = cells[0].textContent.trim();
                if (shouldSkipTitle(title)) return;

                const countEl = cells[1].querySelector('.ui.label, span');
                const solvedCount = countEl ? parseInt(countEl.textContent.trim(), 10) : 0;
                if (isNaN(solvedCount)) return;

                results.push({ partName: title, solvedCount });
            });

            if (expectedRowCount > 0 && results.length !== expectedRowCount) {
                console.warn(`FindIncomplete: Solved counts row count mismatch! Parsed ${results.length} rows, but expected ${expectedRowCount}`);
            }

            return results;
        }

        function extractFromPartialResponse(xml) {
            const xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
            const updates = xmlDoc.querySelectorAll('update');
            for (const upd of updates) {
                const id = upd.getAttribute('id') || '';
                if (id.includes('tbl') || id.includes('solcnt')) {
                    return upd.textContent;
                }
            }
            return Array.from(xmlDoc.querySelectorAll('update'))
                .map(u => u.textContent).join('');
        }

        function countItemsOnPage(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('.ui-datatable-data tr[data-ri]');
            if (rows.length > 0) return rows.length;

            const gridCols = doc.querySelectorAll('.ui-datagrid-column');
            if (gridCols.length > 0) return gridCols.length;

            const cards = doc.querySelectorAll('form .ui-card, form .card, #pkglistform .ui-card, #pkglistform .card, [id$="form"] .ui-card, [id$="form"] .card');
            if (cards.length > 0) return cards.length;

            const buttons = doc.querySelectorAll('input[type="submit"][value*="Check"], button[type="submit"]:not([name*="pkglistform"])');
            if (buttons.length > 0) return buttons.length;

            const trs = doc.querySelectorAll('tbody tr');
            if (trs.length > 0) return trs.length;

            return 0;
        }

        function inferTotal(title, solvedCount) {
            const t = title.toUpperCase();
            if (t.includes('STARTER')) {
                const partMatch = t.match(/PART(\d+)/);
                const partNum = partMatch ? parseInt(partMatch[1], 10) : 0;
                if (partNum === 1) return 55;
                if (partNum === 2) return 25;
                return 20;
            }
            if (t.includes('INTRO')) {
                const partMatch = t.match(/PART(\d+)/);
                const partNum = partMatch ? parseInt(partMatch[1], 10) : 0;
                if (partNum === 1 || partNum === 5) return 30;
                if (partNum === 4) return 15;
                return 20;
            }
            if (t.includes('VIDEO')) return 15;
            if (t.includes('ADDON') || t.includes('ADD-ON') || t.includes('ADD ON')) return 10;
            if (t.includes('LAB')) return solvedCount > 0 ? Math.max(solvedCount, 10) : 10;
            if (t.includes('FUNCTIONS PRACTICE') || t.includes('FUNCTION PRACTICE')) return 20;
            if (t.includes('-H') || t.match(/-H\d+/)) return 10;
            return 10;
        }

        // Title normalization match helper
        function cleanName(name) {
            if (!name) return '';
            return name
                .toUpperCase()
                .replace(/[\xa0\s]+/g, ' ')
                .trim()
                .replace(/^[-.:\s#\(\)\[\]]+|[-.:\s#\(\)\[\]]+$/g, '');
        }

        // Title normalization match helper
        function matchSolvedInfo(partName, solvedCounts) {
            const cleanPart = cleanName(partName);
            // 1. Exact clean match
            let found = solvedCounts.find(s => cleanName(s.partName) === cleanPart);
            if (found) return found;

            // 2. Simplified part suffix match (e.g. PART001 -> PART1)
            const simplify = (str) => str.replace(/PART\s*0+(\d+)/g, 'PART$1').replace(/SET\s*0+(\d+)/g, 'SET$1');
            const simplePart = simplify(cleanPart);
            found = solvedCounts.find(s => simplify(cleanName(s.partName)) === simplePart);
            if (found) return found;

            return null;
        }

        function getCleanTitle(titleEl) {
            let text = "";
            titleEl.childNodes.forEach(node => {
                if (node.nodeType === 3) {
                    text += node.textContent;
                } else if (node.nodeType === 1 && (!node.classList || !node.classList.contains('label'))) {
                    text += node.textContent;
                }
            });
            return text.trim().replace(/\s+/g, ' ');
        }

        function parseTotalCountFromPartPage(html) {
            const matches = [...html.matchAll(/Challenges\s*Count:\s*(\d+)/gi)];
            if (matches.length > 0) {
                let sum = 0;
                for (const match of matches) {
                    sum += parseInt(match[1], 10);
                }
                return sum;
            }
            return 0;
        }

        // ── Active Server State Synchronization Engine ────────────────────────
        let activeServerLevelUrl = null;
        let currentServerPath = []; // Array of transition objects
        let currentServerHtml = null;
        let currentServerViewState = null;

        async function ensureServerAt(levelUrl, targetPath) {
            // Check if level has changed
            if (activeServerLevelUrl !== levelUrl) {
                activeServerLevelUrl = levelUrl;
                currentServerPath = [];
                currentServerHtml = null;
                currentServerViewState = null;
            }

            // Check if targetPath is already active
            const isMatch = targetPath.length === currentServerPath.length &&
                targetPath.every((t, i) => t.btnName === currentServerPath[i].btnName && t.href === currentServerPath[i].href);

            if (isMatch && currentServerHtml) {
                return { html: currentServerHtml, viewState: currentServerViewState };
            }

            console.log(`ensureServerAt: Path mismatch. Resetting and navigating to target path of length ${targetPath.length}`);
            
            // 1. Reset state by GET request to levelUrl
            let html = await queuedFetch(levelUrl, { method: 'GET' });
            let freshState = extractViewState(html);
            if (!freshState) throw new Error('Could not retrieve ViewState token during reset');

            // 2. Replay targetPath
            let currentUrl = levelUrl;
            for (let i = 0; i < targetPath.length; i++) {
                const step = targetPath[i];
                if (step.type === 'POST') {
                    const body = new URLSearchParams({
                        'pkglistform': 'pkglistform',
                        'pkglistform_SUBMIT': '1',
                        'jakarta.faces.ViewState': freshState,
                        [step.btnName]: 'Show'
                    });
                    const postUrl = getPostUrl(currentUrl);
                    html = await queuedFetch(postUrl, { method: 'POST', body: body.toString() });
                    freshState = extractViewState(html);
                    if (!freshState) throw new Error('Could not retrieve ViewState token at step ' + i);
                } else if (step.type === 'LINK') {
                    currentUrl = step.href;
                    html = await queuedFetch(currentUrl, { method: 'GET' });
                    freshState = extractViewState(html);
                    if (!freshState) throw new Error('Could not retrieve ViewState token at step ' + i);
                }
            }

            currentServerPath = [...targetPath];
            currentServerHtml = html;
            currentServerViewState = freshState;

            return { html, viewState: freshState };
        }

        // ── Recursive Deep Crawler ───────────────────────────────────────────
        async function crawlPage(url, transition, parentViewState, pathNames, buttonPath, statusCallback) {
            if (activeController && activeController.signal.aborted) throw new Error('Cancelled');
            
            const currentPathName = pathNames.join(' ➔ ');
            if (currentPathName) {
                statusCallback(`Scraping: ${currentPathName}...`);
            }

            let html;
            let thisPageState = parentViewState;
            const levelUrl = pathNames.length > 0 ? LEVEL_URLS[pathNames[0]] : url;

            if (buttonPath.length > 0) {
                // ensureServerAt will navigate the server to the target path and return the HTML and ViewState
                const res = await ensureServerAt(levelUrl, buttonPath);
                html = res.html;
                thisPageState = res.viewState;
            } else {
                // Entry page of the level
                html = await queuedFetch(url, { method: 'GET' });
                thisPageState = extractViewState(html);
                
                // Clear any previous state tracking for new level
                activeServerLevelUrl = levelUrl;
                currentServerPath = [];
                currentServerHtml = html;
                currentServerViewState = thisPageState;
            }

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const form = doc.getElementById('pkglistform') || doc.querySelector('form');

            // Check if this page contains cards representing parts (indicated by "Challenges Count" or matching CHILD_PART_REGEX)
            const CHILD_PART_REGEX = /\b(PART\d+|SET\s*\d+|H\d{3}|H0\d{2}|H\d{2}[A-Z]?|PACK\d+|PRACTICE\s*\d+)\b/i;
            const partCards = [];
            const cards = doc.querySelectorAll('.ui-card, .card');
            cards.forEach(card => {
                // Leaf card detection to prevent matching main container or menus
                if (card.querySelector('.ui-card, .card')) return;
                if (card.closest('.ui-breadcrumb') || card.closest('.ui-toolbar')) return;

                const header = card.querySelector('.ui.header, .header, h1, h2, h3, h4, .ui-card-title');
                if (!header) return;

                const name = getCleanTitle(header);
                if (!name || shouldSkipTitle(name)) return;

                const txt = card.textContent || '';
                const isPart = /challenges\s*count/i.test(txt) || CHILD_PART_REGEX.test(name);
                
                if (isPart) {
                    const clickTarget = card.querySelector('button, input[type="submit"], input[type="button"], a');
                    if (clickTarget) {
                        const href = clickTarget.getAttribute('href');
                        if (href && !href.startsWith('#') && href !== '') {
                            const nextUrl = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search;
                            const countMatch = txt.match(/challenges\s*count:\s*(\d+)/i);
                            const count = countMatch ? parseInt(countMatch[1], 10) : (inferTotal(name, 0) || 10);
                            partCards.push({
                                partName: name,
                                type: 'LINK',
                                href: nextUrl,
                                totalCount: count
                            });
                        } else {
                            const btnName = clickTarget.getAttribute('name') || clickTarget.getAttribute('id');
                            if (btnName) {
                                const countMatch = txt.match(/challenges\s*count:\s*(\d+)/i);
                                const count = countMatch ? parseInt(countMatch[1], 10) : (inferTotal(name, 0) || 10);
                                partCards.push({
                                    partName: name,
                                    type: 'POST',
                                    btnName: btnName,
                                    totalCount: count
                                });
                            }
                        }
                    }
                }
            });

            if (partCards.length > 0) {
                return partCards.map(c => ({
                    partName: c.partName,
                    buttonPath: [...buttonPath, c.type === 'POST' ? 
                        { type: 'POST', name: c.partName, btnName: c.btnName } : 
                        { type: 'LINK', name: c.partName, href: c.href }
                    ],
                    totalCount: c.totalCount,
                    status: 'ok'
                }));
            }

            // Check if this page contains datatable rows representing parts (matching CHILD_PART_REGEX)
            const partRows = [];
            if (form) {
                const rows = form.querySelectorAll('.ui-datatable-data tr[data-ri]');
                rows.forEach(tr => {
                    const cells = tr.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const title = cells[0].textContent.trim();
                        if (title && !shouldSkipTitle(title) && CHILD_PART_REGEX.test(title)) {
                            const clickTarget = cells[cells.length - 1].querySelector('button, input[type="submit"], input[type="button"], a');
                            if (clickTarget) {
                                const href = clickTarget.getAttribute('href');
                                if (href && !href.startsWith('#') && href !== '') {
                                    const nextUrl = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search;
                                    const count = inferTotal(title, 0) || 10;
                                    partRows.push({
                                        partName: title,
                                        type: 'LINK',
                                        href: nextUrl,
                                        totalCount: count
                                    });
                                } else {
                                    const btnName = clickTarget.getAttribute('name') || clickTarget.getAttribute('id');
                                    if (btnName) {
                                        const count = inferTotal(title, 0) || 10;
                                        partRows.push({
                                            partName: title,
                                            type: 'POST',
                                            btnName: btnName,
                                            totalCount: count
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
            }

            if (partRows.length > 0) {
                return partRows.map(r => ({
                    partName: r.partName,
                    buttonPath: [...buttonPath, r.type === 'POST' ? 
                        { type: 'POST', name: r.partName, btnName: r.btnName } : 
                        { type: 'LINK', name: r.partName, href: r.href }
                    ],
                    totalCount: r.totalCount,
                    status: 'ok'
                }));
            }

            // Check for Solve buttons on this page
            // If the page contains Solve buttons (not Show/View/Check), it is a final page!
            const contentForm = doc.getElementById('pkglistform') || doc.querySelector('form:not([id="j_id_14"])');
            let hasSolveButtons = false;
            if (contentForm) {
                const solveBtns = contentForm.querySelectorAll('button, input[type="submit"], input[type="button"], a.ui-button');
                for (const btn of solveBtns) {
                    const txt = (btn.textContent || btn.value || '').trim().toUpperCase();
                    if (txt === 'SOLVE' || txt.includes('SOLVE')) {
                        hasSolveButtons = true;
                        break;
                    }
                }
            }

            // Find all transitions on this page
            const transitions = [];
            if (form && !hasSolveButtons) {
                // 1. Cards with submit buttons or links
                const cards = form.querySelectorAll('.ui-card, .card');
                cards.forEach(card => {
                    const header = card.querySelector('.ui.header, .header, h1, h2, h3, h4, .ui-card-title');
                    if (!header) return;
                    const name = getCleanTitle(header);
                    if (!name || shouldSkipTitle(name)) return;

                    // Unified clickTarget transition check
                    const clickTarget = card.querySelector('button, input[type="submit"], input[type="button"], a');
                    if (clickTarget) {
                        const btnText = (clickTarget.textContent || clickTarget.value || '').trim().toLowerCase();
                        if (btnText.includes('show') || btnText.includes('view') || btnText.includes('check') || (clickTarget.getAttribute('href') && clickTarget.getAttribute('href').includes('codeprogramgroup'))) {
                            const href = clickTarget.getAttribute('href');
                            if (href && !href.startsWith('#') && href !== '') {
                                const nextUrl = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search;
                                transitions.push({ type: 'LINK', name, href: nextUrl });
                            } else {
                                const btnName = clickTarget.getAttribute('name') || clickTarget.getAttribute('id');
                                if (btnName) {
                                    transitions.push({ type: 'POST', name, btnName });
                                }
                            }
                        }
                    }
                });

                // 2. Datatable rows with submit buttons or links
                if (transitions.length === 0) {
                    const rows = form.querySelectorAll('.ui-datatable-data tr[data-ri]');
                    rows.forEach(tr => {
                        const cells = tr.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const title = cells[0].textContent.trim();
                            if (!title || shouldSkipTitle(title)) return;

                            const btn = cells[cells.length - 1].querySelector('button[type="submit"], input[type="submit"]');
                            if (btn) {
                                const btnName = btn.getAttribute('name');
                                const btnText = (btn.textContent || btn.value || '').trim().toLowerCase();
                                if (btnName && (btnText.includes('show') || btnText.includes('view') || btnText.includes('check'))) {
                                    transitions.push({ type: 'POST', name: title, btnName });
                                    return;
                                }
                            }

                            const link = cells[cells.length - 1].querySelector('a');
                            if (link) {
                                const href = link.getAttribute('href');
                                const btnText = (link.textContent || link.value || '').trim().toLowerCase();
                                if (href && (btnText.includes('show') || btnText.includes('view') || btnText.includes('check') || href.includes('codeprogramgroup'))) {
                                    const nextUrl = new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search;
                                    transitions.push({ type: 'LINK', name: title, href: nextUrl });
                                }
                            }
                        }
                    });
                }
            }

            // If it is a final page (hasSolveButtons or no form or no transitions)
            if (hasSolveButtons || !form || transitions.length === 0) {
                const finalName = pathNames[pathNames.length - 1] || 'Unknown Part';
                const count = parseTotalCountFromPartPage(html) || countItemsOnPage(html) || inferTotal(finalName, 0) || 10;
                return [{
                    partName: finalName,
                    buttonPath: buttonPath,
                    totalCount: count,
                    status: 'ok'
                }];
            }

            // Recurse into each transition
            let results = [];
            for (const trans of transitions) {
                // Loop prevention
                if (pathNames.includes(trans.name)) {
                    console.warn("FindIncomplete: Loop detected under path. Skipping.");
                    continue;
                }

                const nextUrl = trans.type === 'LINK' ? trans.href : url;
                const nextResults = await crawlPage(
                    nextUrl,
                    trans,
                    thisPageState,
                    [...pathNames, trans.name],
                    [...buttonPath, trans],
                    statusCallback
                );
                results = results.concat(nextResults);
            }
            return results;
        }

        // ── Solved Counts Fetcher ────────────────────────────────────────────
        async function getSolvedCounts() {
            await queuedFetch('/faces/candidate/viewsolved.xhtml', { method: 'GET' });
            const body = new URLSearchParams({
                'solcnt': 'solcnt',
                'solcnt:j_id_3k_input': 'tr',
                'solcnt:j_id_3o': '',
                'solcnt_SUBMIT': '1'
            });
            const html = await queuedFetch('/faces/candidate/viewsolved.xhtml', {
                method: 'POST',
                body: body.toString()
            });
            return parseViewSolved(html);
        }

        // ── Core Crawler Orchestration ───────────────────────────────────────
        const LEVEL_URLS = {
            'Level 1': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR',
            'Level 2': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=2',
            'Level 3': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=3',
            'Level 4': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=4',
            'Level 5': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=5',
            'Level 6': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=6',
            'Prime': '/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev=100',
            'LACS': '/faces/candidate/webinarcodetrack.xhtml',
            'LAB': '/faces/candidate/labcodeprograms.xhtml?type=LAB'
        };

        function getPostUrl(url) {
            return url.split('#')[0].split('?')[0];
        }

        async function runFullCrawl() {
            if (currentState === STATE.SCANNING) return;
            setState(STATE.SCANNING);
            showStatus('Starting full scan...', '🔍');
            renderScanningState();

            activeController = new AbortController();

            try {
                let allParts = [];
                const levels = Object.keys(LEVEL_URLS);

                for (let i = 0; i < levels.length; i++) {
                    const levelName = levels[i];
                    const levelUrl = LEVEL_URLS[levelName];
                    showStatus(`Scanning ${levelName}...`, '🔍');
                    updateLoadingMessage(`Scanning ${levelName}...`);

                    const levelParts = await crawlPage(
                        levelUrl,
                        null,
                        null,
                        [levelName],
                        [],
                        (msg) => {
                            showStatus(msg, '🔍');
                            updateLoadingMessage(msg);
                        }
                    );

                    // Add metadata fields to each resolved part
                    levelParts.forEach(p => {
                        p.levelName = levelName;
                        p.levelUrl = levelUrl;
                    });

                    allParts = allParts.concat(levelParts);
                }

                showStatus('Fetching solved counts...', '📊');
                updateLoadingMessage('Fetching solved counts...');
                const solvedCounts = await getSolvedCounts();

                // Map solved counts to parsed parts
                allParts.forEach(part => {
                    if (part.status === 'ok') {
                        const solvedInfo = matchSolvedInfo(part.partName, solvedCounts);
                        part.solvedCount = solvedInfo ? solvedInfo.solvedCount : 0;
                        part.ratio = part.totalCount > 0 ? (part.solvedCount / part.totalCount) : 1.0;
                    } else {
                        part.solvedCount = 0;
                        part.ratio = 0;
                    }
                });

                const cacheData = {
                    parts: allParts,
                    timestamp: Date.now()
                };
                storage.setValue('find_incomplete_cache_v2', JSON.stringify(cacheData));

                setState(STATE.IDLE);
                showStatus('Scan completed! 🎉', '✅');
                setTimeout(hideStatus, 3000);
                
                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    renderList(allParts, cacheData.timestamp);
                }

            } catch (err) {
                if (err.message === 'Cancelled') {
                    setState(STATE.IDLE);
                    hideStatus();
                    return;
                }
                setState(STATE.ERROR);
                showStatus(`Scan failed: ${err.message}`, '❌');
                renderErrorState(err.message);
                setTimeout(hideStatus, 6000);
            } finally {
                activeController = null;
            }
        }

        async function updateSolvedCountsSilently(cachedParts) {
            try {
                const solvedCounts = await getSolvedCounts();
                cachedParts.forEach(part => {
                    if (part.status === 'ok') {
                        const solvedInfo = matchSolvedInfo(part.partName, solvedCounts);
                        part.solvedCount = solvedInfo ? solvedInfo.solvedCount : 0;
                        part.ratio = part.totalCount > 0 ? (part.solvedCount / part.totalCount) : 1.0;
                    }
                });
                
                const cacheData = {
                    parts: cachedParts,
                    timestamp: Date.now()
                };
                storage.setValue('find_incomplete_cache_v2', JSON.stringify(cachedParts));
                
                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    renderList(cachedParts, cacheData.timestamp);
                }
            } catch (e) {
                console.warn("Silent solved counts update failed:", e);
            }
        }

        async function loadAndRenderTracks(forceRefresh = false) {
            if (currentState === STATE.SCANNING) {
                renderScanningState();
                if (statusText) {
                    updateLoadingMessage(statusText.textContent);
                }
                return;
            }

            let cache = null;
            if (!forceRefresh) {
                try {
                    const rawCache = storage.getValue('find_incomplete_cache_v2');
                    if (rawCache) {
                        cache = JSON.parse(rawCache);
                    }
                } catch (e) {
                    console.error("Failed to parse cache:", e);
                }
            }

            if (forceRefresh) {
                await runFullCrawl();
            } else if (!cache || !cache.parts) {
                renderUnscrapedState();
            } else {
                renderList(cache.parts, cache.timestamp);
                updateSolvedCountsSilently(cache.parts);
            }
        }

        function cancelScan() {
            if (activeController) activeController.abort();
            setState(STATE.IDLE);
            hideStatus();
            
            let cache = null;
            try {
                const rawCache = storage.getValue('find_incomplete_cache_v2');
                if (rawCache) cache = JSON.parse(rawCache);
            } catch (_) {}
            
            if (cache && cache.parts) {
                renderList(cache.parts, cache.timestamp);
            } else {
                hideDropdown();
            }
        }

        // ── Sequential Navigation ────────────────────────────────────────────
        async function startNavigation(item) {
            if (currentState === STATE.NAVIGATING) return;
            setState(STATE.NAVIGATING);
            showStatus(`Navigating to ${item.partName}...`, '🚀');
            hideDropdown();
            
            try {
                let currentUrl = item.levelUrl;
                
                // Step 1: GET currentUrl to get initial ViewState
                const html = await queuedFetch(currentUrl, { method: 'GET' });
                let freshState = extractViewState(html);
                if (!freshState) throw new Error('Could not retrieve ViewState token');

                // Step 2: Traverse each intermediate step in buttonPath except the last one
                const path = item.buttonPath || [];
                for (let i = 0; i < path.length - 1; i++) {
                    const step = path[i];
                    if (step.type === 'POST') {
                        const body = new URLSearchParams({
                            'pkglistform': 'pkglistform',
                            'pkglistform_SUBMIT': '1',
                            'jakarta.faces.ViewState': freshState,
                            [step.btnName]: 'Show'
                        });
                        const postUrl = getPostUrl(currentUrl);
                        const resHtml = await queuedFetch(postUrl, { method: 'POST', body: body.toString() });
                        freshState = extractViewState(resHtml);
                        if (!freshState) throw new Error('Could not retrieve ViewState token at step ' + i);
                    } else if (step.type === 'LINK') {
                        currentUrl = step.href;
                        const resHtml = await queuedFetch(currentUrl, { method: 'GET' });
                        freshState = extractViewState(resHtml);
                        if (!freshState) throw new Error('Could not retrieve ViewState token at step ' + i);
                    }
                }

                // Step 3: Create form submission or redirection for final step to navigate browser
                const lastStep = path[path.length - 1];
                if (lastStep.type === 'POST') {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = getPostUrl(currentUrl);
                    form.style.display = 'none';

                    const params = {
                        'pkglistform': 'pkglistform',
                        'pkglistform_SUBMIT': '1',
                        'jakarta.faces.ViewState': freshState,
                        [lastStep.btnName]: 'Show'
                    };

                    for (const [key, value] of Object.entries(params)) {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = key;
                        input.value = value;
                        form.appendChild(input);
                    }

                    document.body.appendChild(form);
                    form.submit();
                } else if (lastStep.type === 'LINK') {
                    window.location.href = lastStep.href;
                }
                
                setState(STATE.IDLE);
            } catch (err) {
                setState(STATE.IDLE);
                showStatus(`Navigation failed: ${err.message}`, '❌');
                setTimeout(hideStatus, 5000);
            }
        }

        // ── UI Components ────────────────────────────────────────────────────
        let dropdown = null;
        let statusPanel = null;
        let statusText = null;

        function ensureDropdown(parentEl) {
            if (dropdown) return;
            dropdown = document.createElement('div');
            dropdown.id = 'find-incomplete-dropdown';
            dropdown.style.cssText =
                'position:absolute;z-index:100000;display:none;' +
                'background:rgba(15,15,15,0.96);backdrop-filter:blur(20px);' +
                '-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);' +
                'border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.65);' +
                'padding:14px;min-width:320px;max-width:380px;' +
                "color:#f4f4f5;font-family:'VT323',monospace;font-size:18px;" +
                'transition:opacity 0.25s, transform 0.25s;opacity:0;transform:translateY(-8px);';
            document.body.appendChild(dropdown);
        }

        function showDropdown(btnEl) {
            ensureDropdown(btnEl);
            injectStyles();
            
            const rect = btnEl.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;
            dropdown.style.left = `${Math.max(10, rect.left + window.scrollX - 180)}px`;
            
            dropdown.style.display = 'block';
            dropdown.offsetHeight; // trigger reflow
            dropdown.style.opacity = '1';
            dropdown.style.transform = 'translateY(0)';
        }

        function hideDropdown() {
            if (!dropdown) return;
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'translateY(-8px)';
            
            setTimeout(() => {
                if (dropdown && dropdown.style.opacity === '0') {
                    dropdown.style.display = 'none';
                }
            }, 250);
        }

        function formatTimeAgo(ts) {
            if (!ts) return '';
            const diffMs = Date.now() - ts;
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours}h ago`;
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}d ago`;
        }

        function renderList(parts, timestamp) {
            if (!dropdown) return;
            dropdown.innerHTML = '';

            // Filter parts
            const incompleteList = parts.filter(item => item.status === 'ok' && item.ratio < 1.0);
            const failedList = parts.filter(item => item.status === 'unknown');

            // Sort incomplete list by ratio ascending
            incompleteList.sort((a, b) => a.ratio - b.ratio);

            // Compute total solved and total questions across all successfully scanned parts
            let totalSolved = 0;
            let totalQuestions = 0;
            parts.forEach(p => {
                if (p.status === 'ok') {
                    totalSolved += p.solvedCount || 0;
                    totalQuestions += p.totalCount || 0;
                }
            });
            const remainingQuestions = totalQuestions - totalSolved;

            const header = document.createElement('div');
            header.style.cssText = 'font-weight: 700; font-size: 18px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;';
            header.innerHTML = '<span>Incomplete Tracks</span>' + 
                               `<span style="font-size: 11px; background: rgba(99,179,237,0.15); color: #63b3ed; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">` +
                               `${incompleteList.length} Tracks | ${remainingQuestions} Qs Left</span>`;
            dropdown.appendChild(header);

            if (timestamp) {
                const timeAgo = formatTimeAgo(timestamp);
                const timeEl = document.createElement('div');
                timeEl.style.cssText = 'font-size: 11px; color: #71717a; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px;';
                timeEl.textContent = `Last Scanned: ${timeAgo}`;
                dropdown.appendChild(timeEl);
            } else {
                const divider = document.createElement('div');
                divider.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 12px;';
                dropdown.appendChild(divider);
            }

            const listContainer = document.createElement('div');
            listContainer.style.cssText = 'max-height: 280px; overflow-y: auto;';

            if (incompleteList.length === 0 && failedList.length === 0) {
                const msg = document.createElement('div');
                msg.style.cssText = 'text-align: center; padding: 20px; color: #a1a1aa; font-style: italic;';
                msg.innerHTML = 'All tracks completed! 🏆';
                dropdown.appendChild(msg);
            } else {
                if (incompleteList.length > 0) {
                    incompleteList.forEach(item => {
                        const pct = Math.round(item.ratio * 100);
                        const itemEl = document.createElement('div');
                        itemEl.className = 'find-inc-item';
                        itemEl.innerHTML = `
                            <div class="find-inc-title">${item.partName}</div>
                            <div class="find-inc-meta">
                                <span>${item.levelName}</span>
                                <span>${item.solvedCount} / ${item.totalCount} solved (${pct}%)</span>
                            </div>
                            <div class="find-inc-progress-bg">
                                <div class="find-inc-progress-bar" style="width: ${pct}%"></div>
                            </div>
                        `;
                        itemEl.addEventListener('click', () => {
                            startNavigation(item);
                        });
                        listContainer.appendChild(itemEl);
                    });
                }

                // VISIBLY SEPARATE "COULDN'T VERIFY" SECTION
                if (failedList.length > 0) {
                    const failHeader = document.createElement('div');
                    failHeader.style.cssText = 'font-weight: 700; font-size: 15px; color: #f87171; margin: 14px 0 8px 0; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; display: flex; justify-content: space-between; align-items: center;';
                    failHeader.innerHTML = '<span>⚠️ Couldn\'t Verify (Crawl Failed)</span>';
                    listContainer.appendChild(failHeader);

                    failedList.forEach(item => {
                        const itemEl = document.createElement('div');
                        itemEl.className = 'find-inc-item find-inc-failed';
                        itemEl.style.cssText = 'border-color: rgba(239, 68, 68, 0.15) !important; background: rgba(239, 68, 68, 0.02);';
                        itemEl.innerHTML = `
                            <div class="find-inc-title" style="color: #d1d5db;">${item.partName}</div>
                            <div class="find-inc-meta" style="color: #ef4444; font-size: 12px;">
                                <span>${item.levelName}</span>
                                <span>Crawl failed: ${item.error || 'Unknown Error'}</span>
                            </div>
                        `;
                        itemEl.addEventListener('click', () => {
                            startNavigation(item);
                        });
                        listContainer.appendChild(itemEl);
                    });
                }
                
                dropdown.appendChild(listContainer);
            }

            const refreshBtn = document.createElement('div');
            refreshBtn.id = 'find-inc-refresh-btn';
            refreshBtn.style.cssText = 'text-align: center; padding: 10px 0; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); color: #63b3ed; cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;';
            refreshBtn.innerHTML = '🔄 Force Re-Crawl & Refresh';
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadAndRenderTracks(true);
            });
            dropdown.appendChild(refreshBtn);
        }

        function renderScanningState() {
            if (!dropdown) return;
            dropdown.innerHTML = `
                <div style="text-align: center; padding: 30px 15px;">
                    <div style="font-size: 24px; margin-bottom: 12px; animation: spin 2s linear infinite; display: inline-block;">🔄</div>
                    <div id="find-inc-loading-msg" style="font-size: 15px; color: #a1a1aa;">Starting scan...</div>
                    <div style="margin-top: 12px; font-size: 11px; color: #71717a;">Please wait, rate-limiting is active to ensure safety.</div>
                    <div id="find-inc-cancel-btn" style="margin-top: 16px; font-size: 13px; color: #f87171; cursor: pointer; text-decoration: underline;">Cancel Scan</div>
                </div>
            `;
            const cancelBtn = dropdown.querySelector('#find-inc-cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cancelScan();
                });
            }
        }

        function renderErrorState(msg) {
            if (!dropdown) return;
            dropdown.innerHTML = `
                <div style="text-align: center; padding: 30px 15px;">
                    <div style="font-size: 24px; margin-bottom: 12px;">❌</div>
                    <div style="font-size: 15px; color: #f87171; font-weight: 600;">Scan Failed</div>
                    <div style="margin-top: 8px; font-size: 13px; color: #a1a1aa; max-height: 80px; overflow-y: auto;">${msg}</div>
                    <div id="find-inc-retry-btn" style="margin-top: 16px; font-size: 13px; color: #63b3ed; cursor: pointer; text-decoration: underline;">Try Again</div>
                </div>
            `;
            const retryBtn = dropdown.querySelector('#find-inc-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadAndRenderTracks(true);
                });
            }
        }

        function renderUnscrapedState() {
            if (!dropdown) return;
            dropdown.innerHTML = `
                <div style="text-align: center; padding: 24px 12px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
                    <div style="font-size: 15px; color: #a1a1aa; margin-bottom: 12px;">No Scraped Data Found</div>
                    <div style="font-size: 12px; color: #71717a; margin-bottom: 16px; line-height: 1.4;">
                        Please run a scan to discover and list all incomplete tracks.
                    </div>
                    <div id="find-inc-start-btn" style="
                        display: inline-block;
                        background: linear-gradient(135deg, #3182ce, #63b3ed);
                        color: white;
                        padding: 8px 16px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        text-transform: uppercase;
                        box-shadow: 0 4px 12px rgba(49, 130, 206, 0.3);
                    ">Start Scan</div>
                </div>
            `;
            const startBtn = dropdown.querySelector('#find-inc-start-btn');
            if (startBtn) {
                startBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runFullCrawl();
                });
            }
        }

        function updateLoadingMessage(msg) {
            const el = document.getElementById('find-inc-loading-msg');
            if (el) el.textContent = msg;
        }

        // Expose init/crawling interfaces
        function ensureStatusPanel() {
            if (statusPanel) return;
            statusPanel = document.createElement('div');
            statusPanel.id = 'find-incomplete-status';
            statusPanel.style.cssText =
                'position:fixed;bottom:92px;left:24px;z-index:99997;' +
                'min-width:260px;max-width:380px;padding:12px 16px;' +
                'background:rgba(15,15,15,0.95);backdrop-filter:blur(18px);' +
                '-webkit-backdrop-filter:blur(18px);border-radius:14px;' +
                'border:1px solid rgba(99,179,237,0.3);' +
                'box-shadow:0 16px 48px rgba(0,0,0,0.65);' +
                "font-family:'VT323',monospace;font-size:19px;color:#e4e4e7;" +
                'display:none;transition:opacity 0.2s;';
            statusText = document.createElement('span');
            statusPanel.appendChild(statusText);
            document.body.appendChild(statusPanel);
        }

        // Expose function for updating status Panel
        function showStatus(msg, icon) {
            ensureStatusPanel();
            statusText.textContent = (icon ? icon + '  ' : '') + msg;
            statusPanel.style.display = 'block';
            statusPanel.style.opacity = '1';
        }

        function hideStatus() {
            if (!statusPanel) return;
            statusPanel.style.opacity = '0';
            setTimeout(() => {
                if (statusPanel) statusPanel.style.display = 'none';
            }, 200);
        }

        function injectStyles() {
            if (document.getElementById('find-incomplete-styles')) return;
            const style = document.createElement('style');
            style.id = 'find-incomplete-styles';
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .find-inc-item {
                    display: flex;
                    flex-direction: column;
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-bottom: 6px;
                    transition: background 0.2s, transform 0.1s;
                    border: 1px solid transparent;
                }
                .find-inc-item:hover {
                    background: rgba(99, 179, 237, 0.1) !important;
                    border-color: rgba(99, 179, 237, 0.2) !important;
                    transform: translateY(-1px);
                }
                .find-inc-item:active {
                    transform: translateY(0);
                }
                .find-inc-failed:hover {
                    background: rgba(239, 68, 68, 0.08) !important;
                    border-color: rgba(239, 68, 68, 0.25) !important;
                }
                .find-inc-title {
                    font-weight: 600;
                    font-size: 16px;
                    color: #e4e4e7;
                }
                .find-inc-meta {
                    font-size: 13px;
                    color: #a1a1aa;
                    margin-top: 2px;
                    display: flex;
                    justify-content: space-between;
                }
                .find-inc-progress-bg {
                    width: 100%;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 3px;
                    margin-top: 6px;
                    overflow: hidden;
                }
                .find-inc-progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #3182ce, #63b3ed);
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }
            `;
            document.head.appendChild(style);
        }

        // ── Set State ────────────────────────────────────────────────────────
        function setState(s) {
            currentState = s;
        }

        // ── Init & Cleanup ───────────────────────────────────────────────────
        function injectMenuButton() {
            if (!SETTINGS.enableFindIncomplete) return;
            const menuList = document.querySelector(
                '.ui-toolbar-group-right .ui-menu-list, ' +
                '.ui-toolbar-group-right ul[role="menubar"]'
            );
            if (!menuList || document.getElementById('find-incomplete-btn')) return;

            const li = document.createElement('li');
            li.className = 'ui-menuitem ui-widget ui-corner-all';
            li.setAttribute('role', 'none');
            li.innerHTML =
                '<a id="find-incomplete-btn" tabindex="-1" role="menuitem" ' +
                'class="ui-menuitem-link ui-corner-all" href="#" ' +
                'style="cursor:pointer;white-space:nowrap;">' +
                '<span class="ui-menuitem-icon ui-icon pi pi-fw pi-search ui-menuitem-icon-left" ' +
                'aria-hidden="true"></span>' +
                '<span class="ui-menuitem-text">Find Incomplete</span>' +
                '</a>';

            const anchor = li.querySelector('a');
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    hideDropdown();
                } else {
                    showDropdown(anchor);
                    loadAndRenderTracks();
                }
            });

            const lastItem = menuList.lastElementChild;
            menuList.insertBefore(li, lastItem);
        }

        function init() {
            if (!SETTINGS.enableFindIncomplete) return;
            injectMenuButton();

            const obs = new MutationObserver(() => {
                if (!document.getElementById('find-incomplete-btn')) {
                    injectMenuButton();
                }
            });
            if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true });
            }

            document.addEventListener('click', (e) => {
                if (dropdown && dropdown.style.display === 'block' && 
                    !dropdown.contains(e.target) && 
                    e.target.id !== 'find-incomplete-btn' && 
                    !e.target.closest('#find-incomplete-btn')) {
                    hideDropdown();
                }
            });
        }

        return {
            init,
            loadAndRenderTracks,
            getState: () => currentState,
            cancel: () => {
                if (activeController) activeController.abort();
                setState(STATE.IDLE);
                hideStatus();
                hideDropdown();
            }
        };
    })();
























    // Initialize FindIncompleteModule when DOM is ready AND script is enabled
    onScriptEnabled(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(FindIncompleteModule.init, 800);
            });
        } else {
            setTimeout(FindIncompleteModule.init, 600);
        }

        // Expose for manual control from browser console
        window.FindIncompleteModule = FindIncompleteModule;
    });

})();                 