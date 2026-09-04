// ==UserScript==
// @name         Project-KillCode
// @namespace    http://tampermonkey.net/
// @version      5.1a
// @description  Bypass tab switching, copy/paste restrictions, full-screen enforcement, auto-solve captcha, and AI-powered solution generator
// @author       ToonTamilIndia & Vishnu-tppr (Captcha solver by adithyagenie)
// @match        https://*.skillrack.com/*
// @match        https://skillrack.com/*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js
// @require      https://js.puter.com/v2/
// @grant        GM_xmlhttpRequest
// @grant        GM_cookie
// @grant        GM.cookie
// @grant        unsafeWindow
// @connect      integrate.api.nvidia.com
// @connect      127.0.0.1
// @connect      localhost
// @connect      api.openai.com
// @connect      skillrack.com
// @connect      auth.openai.com
// @connect      chatgpt.com
// @run-at       document-start
// @downloadURL https://raw.githubusercontent.com/Vishnu-tppr/Project-KillCode/refs/heads/main/Project-KillCode.js
// @updateURL https://raw.githubusercontent.com/Vishnu-tppr/Project-KillCode/refs/heads/main/Project-KillCode.js
// ==/UserScript==

// 1. Sandbox bridge
if (typeof GM_xmlhttpRequest !== 'undefined') {
    // Expose required libraries to the webpage context
    if (typeof unsafeWindow !== 'undefined') {
        if (typeof Tesseract !== 'undefined') unsafeWindow.Tesseract = Tesseract;
        if (typeof puter !== 'undefined') unsafeWindow.puter = puter;
    }

    // Helper to fetch cookies from all GM cookie APIs
    async function collectGmCookies() {
        const cookieMap = new Map();

        const addCookies = (arr) => {
            if (Array.isArray(arr)) {
                for (const c of arr) {
                    if (c && c.name && c.value) {
                        cookieMap.set(c.name, c.value);
                    }
                }
            }
        };

        // 1. GM_cookie.list callback API
        if (typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function') {
            const queryGmCookie = (details) => new Promise((res) => {
                try {
                    GM_cookie.list(details, (list, err) => {
                        if (!err && list) res(list);
                        else res([]);
                    });
                } catch (e) {
                    res([]);
                }
            });

            // Query with multiple domain/path combos to catch HttpOnly JSESSIONID
            // SkillRack cookies are on www.skillrack.com with path=/
            const queries = [
                { url: window.location.href },
                { url: window.location.origin },
                { domain: 'skillrack.com' },
                { domain: '.skillrack.com' },
                { domain: 'www.skillrack.com' },
                { url: 'https://www.skillrack.com' },
                { url: 'https://skillrack.com' },
                {}, // Empty catches all
            ];

            const results = await Promise.all(queries.map(q => queryGmCookie(q)));
            for (const r of results) addCookies(r);
        }

        // 2. GM.cookie.list Promise API (GM4 / Violentmonkey / Tampermonkey v5)
        if (typeof GM !== 'undefined' && GM && GM.cookie && typeof GM.cookie.list === 'function') {
            try {
                const gmQueries = [
                    { url: window.location.href },
                    { url: window.location.origin },
                    { domain: 'skillrack.com' },
                    { domain: '.skillrack.com' },
                    { domain: 'www.skillrack.com' },
                    { url: 'https://www.skillrack.com' },
                    { url: 'https://skillrack.com' },
                    {},
                ];
                const results = await Promise.all(gmQueries.map(q => GM.cookie.list(q).catch(() => [])));
                for (const r of results) addCookies(r);
            } catch (e) {}
        }

        // 3. Fallback: Parse document.cookie (non-HttpOnly cookies only)
        if (typeof document !== 'undefined' && document.cookie) {
            for (const part of document.cookie.split(';')) {
                const eqIdx = part.indexOf('=');
                if (eqIdx > 0) {
                    const k = part.slice(0, eqIdx).trim();
                    const v = part.slice(eqIdx + 1).trim();
                    if (k && !cookieMap.has(k)) {
                        cookieMap.set(k, v);
                    }
                }
            }
        }

        // 4. CRITICAL: Extract HttpOnly JSESSIONID via live request
        // GM_cookie.list often doesn't return HttpOnly cookies. Make a real request
        // via GM_xmlhttpRequest and capture the Cookie request header that the browser sends.
        if (!cookieMap.has('JSESSIONID') && typeof GM_xmlhttpRequest !== 'undefined') {
            try {
                const req = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'https://www.skillrack.com/faces/candidate/codetutor.xhtml',
                        // Don't set Cookie header - let browser attach it automatically
                        anonymous: false, // Use browser's cookie jar
                        onload: function(response) {
                            // The browser's actual cookie header was sent with the request
                            // Check if response has Set-Cookie for session refresh
                            resolve(response);
                        },
                        onerror: function(err) {
                            reject(err);
                        }
                    });
                });
                // If request succeeded, the browser sent its cookies automatically
                // Check response for Set-Cookie (session refresh)
                if (req && req.responseHeadersRaw) {
                    const setCookieMatches = req.responseHeadersRaw.match(/^set-cookie:\s*(JSESSIONID=[^;\r\n]+)/gim) || [];
                    if (setCookieMatches.length) {
                        const sid = setCookieMatches[setCookieMatches.length - 1].replace(/^set-cookie:\s*/i, '').trim();
                        cookieMap.set('JSESSIONID', sid.split(';')[0].split('=')[1]);
                        console.debug('[KillCode:GM_cookie] Extracted JSESSIONID from Set-Cookie:', sid.substring(0, 30) + '...');
                    }
                }
            } catch (e) {
                console.debug('[KillCode:GM_cookie] Live request fallback failed:', e);
            }
        }

        // 5. DOM fallback: JSESSIONID sometimes appears in form action URLs
        if (!cookieMap.has('JSESSIONID')) {
            try {
                const els = document.querySelectorAll('form[action*="jsessionid="], a[href*="jsessionid="], link[href*="jsessionid="]');
                for (const el of els) {
                    const attr = el.getAttribute('action') || el.getAttribute('href') || '';
                    const match = attr.match(/jsessionid=([A-Za-z0-9.\-_]{16,})/i);
                    if (match && match[1]) {
                        cookieMap.set('JSESSIONID', match[1]);
                        console.debug('[KillCode:GM_cookie] Extracted JSESSIONID from DOM:', match[1].substring(0, 30) + '...');
                        break;
                    }
                }
            } catch (e) {}
        }

        if (cookieMap.size === 0) return '';
        return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    // Listen for requests from the webpage context
    // SECURITY: Only accept messages from same-origin pages to prevent malicious scripts from triggering privileged requests
    window.addEventListener('message', async (event) => {
        // Validate origin to prevent CSRF-like attacks
        if (event.origin !== window.location.origin) {
            console.warn('[KillCode] Blocked postMessage from unauthorized origin:', event.origin);
            return;
        }
        if (event.data && event.data.type === 'GM_XHR_REQUEST') {
            const { id, options } = event.data;
            const reqTimeout = options.timeout || 180000;
            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers,
                data: options.data,
                timeout: reqTimeout,
                onload: function (response) {
                    window.postMessage({
                        type: 'GM_XHR_RESPONSE',
                        id: id,
                        status: response.status,
                        statusText: response.statusText,
                        responseText: response.responseText,
                        responseHeaders: response.responseHeaders
                    }, '*');
                },
                onerror: function (err) {
                    window.postMessage({
                        type: 'GM_XHR_RESPONSE',
                        id: id,
                        error: err.error || 'Network error'
                    }, '*');
                },
                ontimeout: function () {
                    window.postMessage({
                        type: 'GM_XHR_RESPONSE',
                        id: id,
                        error: `Request timed out (${Math.round(reqTimeout / 1000)}s) on ${options.url}`
                    }, '*');
                }
            });
        } else if (event.data && event.data.type === 'GM_GET_COOKIES_REQUEST') {
            const { id } = event.data;
            try {
                const cookieStr = await collectGmCookies();
                console.debug('[KillCode:GM_cookie] Collected cookies (keys: ' + (cookieStr.split(';').length) + ', length: ' + cookieStr.length + ')');
                window.postMessage({
                    type: 'GM_GET_COOKIES_RESPONSE',
                    id: id,
                    cookies: cookieStr
                }, '*');
            } catch (e) {
                console.warn('[KillCode:GM_cookie] Error collecting cookies:', e);
                window.postMessage({
                    type: 'GM_GET_COOKIES_RESPONSE',
                    id: id,
                    cookies: document.cookie || ''
                }, '*');
            }
        }
    });

}

const script = document.createElement('script');
script.textContent = `(${mainCode.toString()})();`;
(document.head || document.documentElement).appendChild(script);
script.remove();

function mainCode() {
    'use strict';

    // A wrapper around GM_xmlhttpRequest via message bridge
    const gmFetch = (url, options = {}) => {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            const timeoutMs = options.timeout || 180000; // 180s default timeout for AI models
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error(`gmFetch timeout (${Math.round(timeoutMs / 1000)}s) on ${url}`));
            }, timeoutMs + 1000);

            const handleMessage = (event) => {
                // Validate origin to prevent spoofed responses
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'GM_XHR_RESPONSE' && event.data.id === requestId) {
                    clearTimeout(timeoutId);
                    window.removeEventListener('message', handleMessage);
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else {
                        resolve({
                            ok: event.data.status >= 200 && event.data.status < 300,
                            status: event.data.status,
                            statusText: event.data.statusText,
                            responseText: event.data.responseText,
                            responseHeaders: event.data.responseHeaders || '',
                            responseHeadersRaw: event.data.responseHeaders || '',
                            headers: {
                                get: (name) => {
                                    const headersText = event.data.responseHeaders || '';
                                    const match = new RegExp('^' + name + ':\\s*(.*)$', 'mi').exec(headersText);
                                    return match ? match[1].trim() : null;
                                }
                            },
                            json: async () => JSON.parse(event.data.responseText),
                            text: async () => event.data.responseText
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
                    data: options.body || options.data,
                    timeout: timeoutMs
                }
            }, '*');
        });
    };

    // Helper to extract jsessionid from DOM links or form attributes
    function extractJSessionIdFromDOM() {
        try {
            const els = document.querySelectorAll('form[action*="jsessionid="], a[href*="jsessionid="], link[href*="jsessionid="], script[src*="jsessionid="]');
            for (const el of els) {
                const attr = el.getAttribute('action') || el.getAttribute('href') || el.getAttribute('src') || '';
                const match = attr.match(/jsessionid=([A-Za-z0-9.\-_]+)/i);
                if (match && match[1]) return match[1];
            }
            const match = (document.documentElement.innerHTML || '').match(/[;?&]jsessionid=([A-Za-z0-9.\-_]{16,})/i);
            if (match && match[1]) return match[1];
        } catch (e) {}
        return '';
    }

    // A wrapper to extract full SkillRack cookies (including httpOnly) via GM_cookie bridge
    const gmGetCookies = () => {
        return new Promise((resolve) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            const timer = setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                let fallback = document.cookie || '';
                const domJ = extractJSessionIdFromDOM();
                if (domJ && !fallback.includes('JSESSIONID')) {
                    fallback = `JSESSIONID=${domJ}; ` + fallback;
                }
                const saved = storage.getValue('skillrack_custom_cookie', '');
                if (saved && !fallback.includes('JSESSIONID')) {
                    fallback = saved + '; ' + fallback;
                }
                resolve(fallback);
            }, 1500);

            const handleMessage = (event) => {
                // Validate origin to prevent spoofed responses
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'GM_GET_COOKIES_RESPONSE' && event.data.id === requestId) {
                    clearTimeout(timer);
                    window.removeEventListener('message', handleMessage);
                    let resCookies = event.data.cookies || document.cookie || '';
                    const domJ = extractJSessionIdFromDOM();
                    if (domJ && !resCookies.includes('JSESSIONID')) {
                        resCookies = `JSESSIONID=${domJ}; ` + resCookies;
                    }
                    const saved = storage.getValue('skillrack_custom_cookie', '');
                    if (saved && !resCookies.includes('JSESSIONID')) {
                        resCookies = saved + '; ' + resCookies;
                    }
                    resolve(resCookies);
                }
            };

            window.addEventListener('message', handleMessage);
            window.postMessage({
                type: 'GM_GET_COOKIES_REQUEST',
                id: requestId
            }, '*');
        });
    };

    // ============================================
    // SCRIPT VERSION & REMOTE URLS
    // ============================================
    const SCRIPT_VERSION = '5.1';
    const REMOTE_SCRIPT_URL = 'https://raw.githubusercontent.com/Vishnu-tppr/Project-KillCode/refs/heads/main/Project-KillCode.js';
    const KILL_SWITCH_URL = 'https://raw.githubusercontent.com/Vishnu-tppr/Project-KillCode/refs/heads/main/kill.txt';
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
    // KILL SWITCH CHECK (Live Background Check)
    // ============================================
    const checkKillSwitch = async () => {
        const cachedDisabled = localStorage.getItem(SCRIPT_DISABLED_KEY);
        if (cachedDisabled === 'true') return false;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(KILL_SWITCH_URL + '?t=' + Date.now(), {
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                console.warn('[KillCode] Kill-switch check failed (HTTP', response.status, ') - respecting cached state');
                // FAIL-SAFE: Respect the cached disabled state; if no cache, assume enabled
                return cachedDisabled !== 'true';
            }
            const text = (await response.text()).trim().toLowerCase();
            if (text === 'false' || text === 'disabled' || text === 'kill' || text === '0') {
                localStorage.setItem(SCRIPT_DISABLED_KEY, 'true');
                console.log('[KillCode] Kill-switch activated - script disabled');
                return false;
            }
            localStorage.removeItem(SCRIPT_DISABLED_KEY);
            return true;
        } catch (e) {
            console.warn('[KillCode] Kill-switch check error:', e.message, '- respecting cached state');
            // FAIL-SAFE: Network errors should not override cached disabled state
            // If previously marked disabled, stay disabled; otherwise assume enabled
            return cachedDisabled !== 'true';
        }
    };

    // ============================================
    // VERSION CHECK (Cached - 6h TTL)
    // ============================================
    const checkForUpdate = async () => {
        const lastCheck = parseInt(localStorage.getItem('killcode_last_update_check') || '0', 10);
        const cachedVersion = localStorage.getItem('killcode_cached_remote_version');

        if (Date.now() - lastCheck < 6 * 60 * 60 * 1000 && cachedVersion) {
            return cachedVersion;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const response = await fetch(REMOTE_SCRIPT_URL + '?t=' + Date.now(), {
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) return cachedVersion || null;

            const scriptText = await response.text();
            const versionMatch = scriptText.match(/@version\s+(\d+\.\d+(?:\.\d+)?)/);
            if (versionMatch) {
                localStorage.setItem('killcode_last_update_check', String(Date.now()));
                localStorage.setItem('killcode_cached_remote_version', versionMatch[1]);
                return versionMatch[1];
            }
        } catch (e) {}
        return cachedVersion || null;
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

    // Run initialization immediately without blocking page load
    let scriptEnabled = (localStorage.getItem(SCRIPT_DISABLED_KEY) !== 'true');
    let initCallbacks = [];

    // Register a callback to run when script is enabled
    const onScriptEnabled = (callback) => {
        if (scriptEnabled) {
            try { callback(); } catch (e) { console.error('[SkillRack Bypass] Callback error:', e); }
        } else {
            initCallbacks.push(callback);
        }
    };

    // Run verification non-blockingly in background
    (async () => {
        const ok = await initializeScript();
        if (ok && !scriptEnabled) {
            scriptEnabled = true;
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
        humanTypingMode: false,   // Type AI solution char-by-char at human speed (toggle via 'q' key)

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
        openaiModel: "gpt-5.4-mini",        // oauth / apikey mode default
        openaiAuthMode: "chatgpt",            // 'chatgpt' | 'oauth' | 'apikey'
        openaiOAuthBaseUrl: "http://127.0.0.1:10531/v1",
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

        // ========== NVIDIA NIM SETTINGS ==========
        nvidiaApiKey: "",
        nvidiaModel: "deepseek-ai/deepseek-v4-pro",
        // =========================================

        // ========== OMNIROUTE SETTINGS (NEW) ==========
        omnirouteBaseUrl: "http://localhost:20128/v1",
        omnirouteApiKey: "",
        omnirouteModel: "kr/claude-haiku-4.5",
        // ==============================================

        // ========== AUTO SOLVER SETTINGS ==========
        enableAutoSolver: false,
        autoSolverMaxRetries: 3,
        autoSolverDelay: 500,
        // ==========================================

        // ========== FIND INCOMPLETE SETTINGS ==========
        enableFindIncomplete: true,
        // ===============================================

        // ========== FASTAPI QUESTIONS PANEL SETTINGS ==========
        enableFastAPIQuestions: true,
        fastAPIBaseUrl: 'http://127.0.0.1:8000',
        // =======================================================
    };

    // Load settings from localStorage or use defaults
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem('skillrack_bypass_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                const merged = { ...DEFAULT_SETTINGS, ...parsed };
                // Migrate: old default was 1 which made retry loop never fire — bump to 5
                if (merged.autoSolverMaxRetries < 2) merged.autoSolverMaxRetries = 5;
                // Migrate: if user has no authMode, migrate based on existing settings
                if (!parsed.openaiAuthMode) {
                    if (parsed.openaiApiKey) {
                        merged.openaiAuthMode = 'apikey';
                    } else {
                        merged.openaiAuthMode = 'chatgpt';
                    }
                }
                // Migrate: legacy 'extension'/'oauth' mode → new 'chatgpt' mode
                if (merged.openaiAuthMode === 'extension' || merged.openaiAuthMode === 'oauth') {
                    merged.openaiAuthMode = 'chatgpt';
                }
                // In chatgpt mode, if the saved model is an apikey-only id, switch to Codex default
                const APIKEY_ONLY_MODEL_IDS = /^(gpt-4o|gpt-4|gpt-3\.5|o1|o3|o4)/;
                if (merged.openaiAuthMode === 'chatgpt' && APIKEY_ONLY_MODEL_IDS.test(merged.openaiModel)) {
                    merged.openaiModel = 'gpt-5.4-mini';
                }
                return merged;
            }
        } catch (e) {
            console.log('Failed to load settings:', e);
        }
        return { ...DEFAULT_SETTINGS };
    };

    const saveSettings = (settings = SETTINGS) => {
        try {
            if (!settings || typeof settings !== 'object') {
                console.warn('[Settings] Invalid settings object provided, using current SETTINGS');
                settings = SETTINGS;
            }
            localStorage.setItem('skillrack_bypass_settings', JSON.stringify(settings));
            console.debug('[Settings] Saved successfully');
        } catch (e) {
            console.error('[Settings] Failed to save settings:', e.message);
            // Attempt to store in memory fallback if localStorage is full
            if (e.name === 'QuotaExceededError') {
                console.warn('[Settings] localStorage quota exceeded - settings saved in current session only');
            }
        }
    };

    let SETTINGS = loadSettings();

    // ========== NON-BLOCKING TOAST NOTIFICATION SYSTEM ==========
    const showToastPill = (message, type = 'info', duration = 2500) => {
        try {
            let container = document.getElementById('pkc-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'pkc-toast-container';
                container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
                (document.body || document.documentElement).appendChild(container);
            }

            const toast = document.createElement('div');
            toast.style.cssText = 'background:rgba(20,20,26,0.94);color:#ffffff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,0.4);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.12);transition:all 0.25s ease-out;opacity:0;transform:translateY(-8px);pointer-events:auto;display:flex;align-items:center;gap:8px;';

            const isError = type === 'error' || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed');
            const icon = isError ? '✕' : type === 'success' ? '✓' : 'ℹ';
            const iconColor = isError ? '#FF5252' : type === 'success' ? '#4CAF50' : '#64B5F6';

            toast.innerHTML = `<span style="color:${iconColor};font-weight:bold;font-size:14px;">${icon}</span><span style="color:#f0f0f0;">${message}</span>`;
            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-8px)';
                setTimeout(() => toast.remove(), 250);
            }, duration);
        } catch (e) {
            console.log('[Toast]', message);
        }
    };

    const notifyPopup = (message, duration = 3000) => {
        console.log('[Notification]', message);
        if (SETTINGS.enablePopupMode) {
            alert(message);
        } else {
            showToastPill(message, 'info', duration);
        }
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
    // OAUTH LOGIN MODULE (PKCE — no terminal needed)
    // Uses the 'Sign in with ChatGPT' Chrome extension as OAuth callback bridge.
    // Stores tokens in localStorage. Makes API calls directly to chatgpt.com via gmFetch.
    // ============================================

    const OAuthLogin = (function () {
        'use strict';

        const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
        const REDIRECT_URI = 'http://localhost:1455/auth/callback';
        const ISSUER = 'https://auth.openai.com';
        const TOKEN_URL = `${ISSUER}/oauth/token`;
        const AUTHORIZE_URL = `${ISSUER}/oauth/authorize`;
        const SCOPE = 'openid profile email offline_access';
        const EXT_STATE_PREFIX = 'oo2_';
        const PENDING_KEY = 'oai_pending_login';
        const SESSION_KEY = 'oai_oauth_session';

        // ---- encoding helpers ----
        function bytesToBase64Url(bytes) {
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
        }

        function encodeBase64Url(str) {
            return bytesToBase64Url(new TextEncoder().encode(str));
        }

        function randomUrlSafeString(byteLength) {
            const bytes = new Uint8Array(byteLength);
            crypto.getRandomValues(bytes);
            return bytesToBase64Url(bytes);
        }

        async function sha256Base64Url(str) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return bytesToBase64Url(new Uint8Array(digest));
        }

        // ---- extension detection ----
        const EXT_ID = 'odbgboachaefbbbdiffcefhpkekhfcna'; // Web Store ID
        const LOCAL_EXT_KEY = 'oai_local_ext_id';          // Storage key for unpacked dev-mode ID

        async function fetchInstalledJson(extId) {
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 750);
                const resp = await fetch(`chrome-extension://${extId}/src/installed.json`, { cache: 'no-store', signal: controller.signal });
                if (!resp.ok) return false;
                const data = await resp.json().catch(() => null);
                return data?.installed === true;
            } catch { return false; }
        }

        async function pingExtension(extId) {
            return new Promise((resolve) => {
                try {
                    if (!chrome?.runtime?.sendMessage) { resolve(false); return; }
                    const timer = setTimeout(() => resolve(false), 750);
                    chrome.runtime.sendMessage(extId, { type: 'openai-oauth-ping' }, (response) => {
                        clearTimeout(timer);
                        if (chrome.runtime.lastError) { resolve(false); return; }
                        resolve(response?.installed === true);
                    });
                } catch { resolve(false); }
            });
        }

        async function isExtensionInstalled() {
            // 1. Try Web Store ID via direct fetch (works when installed from store)
            if (await fetchInstalledJson(EXT_ID)) return true;

            // 2. Try stored local extension ID (works when loaded as unpacked)
            const localId = localStorage.getItem(LOCAL_EXT_KEY);
            if (localId && localId !== EXT_ID) {
                if (await fetchInstalledJson(localId) || await pingExtension(localId)) return true;
            }

            // 3. Try chrome.runtime.sendMessage ping to Web Store ID
            if (await pingExtension(EXT_ID)) return true;

            return false;
        }

        // ---- session storage ----
        function getSession() {
            try {
                const raw = localStorage.getItem(SESSION_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        }

        function setSession(session) {
            try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { }
        }

        function clearSession() {
            try {
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(PENDING_KEY);
                localStorage.removeItem('openai_oauth_models_cache');
            } catch { }
        }

        function isSignedIn() {
            const s = getSession();
            if (!s?.accessToken) return false;
            return true;
        }

        // ---- pending login (survives page reload) ----
        function writePending(data) {
            try { localStorage.setItem(PENDING_KEY, JSON.stringify(data)); } catch { }
        }

        function readPending() {
            try {
                const raw = localStorage.getItem(PENDING_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        }

        function clearPending() {
            try { localStorage.removeItem(PENDING_KEY); } catch { }
        }

        // ---- token refresh ----
        async function refreshTokens(refreshToken) {
            const resp = await gmFetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: CLIENT_ID
                })
            });
            if (!resp.ok) throw new Error(`Token refresh failed: HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data.access_token) throw new Error('No access_token in refresh response');
            return data;
        }

        // Returns a valid access token, refreshing if necessary
        async function getAccessToken() {
            const s = getSession();
            if (!s?.accessToken) return null;

            // Refresh if token is expiring within 5 minutes
            if (s.expiresAt) {
                const expiresAt = new Date(s.expiresAt).getTime();
                if (expiresAt - Date.now() < 5 * 60 * 1000 && s.refreshToken) {
                    try {
                        const newTokens = await refreshTokens(s.refreshToken);
                        const newSession = {
                            ...s,
                            accessToken: newTokens.access_token,
                            refreshToken: newTokens.refresh_token || s.refreshToken,
                            expiresAt: newTokens.expires_in
                                ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
                                : undefined
                        };
                        setSession(newSession);
                        return newSession.accessToken;
                    } catch (e) {
                        console.warn('[OAuthLogin] Token refresh failed:', e);
                    }
                }
            }

            return s.accessToken;
        }

        // ---- encode the state for the Chrome extension ----
        function createExtensionState(callbackUrl) {
            const payload = {
                type: 'openai-oauth-callback',
                version: 1,
                nonce: randomUrlSafeString(24),
                callbackUrl
            };
            return `${EXT_STATE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
        }

        // ---- initiate login ----
        // Opens OAuth in a POPUP window — the current SkillRack tab never navigates away.
        // Flow:
        //   1. Popup → auth.openai.com (user logs in)
        //   2. OpenAI → localhost:1455/auth/callback
        //   3. Chrome extension intercepts → redirects to callbackUrl (this page + ?oo2_cb=1)
        //   4. This page's handleCallbackIfPresent() exchanges code → stores tokens
        //   5. Popup closes, Settings UI refreshes automatically
        async function initiateLogin() {
            const isInstalled = await isExtensionInstalled();
            if (!isInstalled) {
                return { status: 'needs-extension', installUrl: `https://chromewebstore.google.com/detail/sign-in-with-chatgpt/${EXT_ID}` };
            }

            const codeVerifier = randomUrlSafeString(48);
            const codeChallenge = await sha256Base64Url(codeVerifier);

            // The extension will redirect the popup to THIS url after intercepting localhost:1455
            const callbackUrl = window.location.href.split('?')[0] + '?oo2_cb=1';
            const state = createExtensionState(callbackUrl);

            const authUrl = new URL(AUTHORIZE_URL);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', CLIENT_ID);
            authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
            authUrl.searchParams.set('scope', SCOPE);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('id_token_add_organizations', 'true');
            authUrl.searchParams.set('codex_cli_simplified_flow', 'true');

            // Save PKCE state so handleCallbackIfPresent() can finish the exchange
            writePending({ state, codeVerifier, redirectUri: REDIRECT_URI, callbackUrl });

            // Open a small, centred popup — current page stays intact
            const pw = 520, ph = 640;
            const pl = Math.round(window.screenX + (window.outerWidth - pw) / 2);
            const pt = Math.round(window.screenY + (window.outerHeight - ph) / 2);
            const popup = window.open(
                authUrl.toString(),
                'openai_oauth_login',
                `width=${pw},height=${ph},left=${pl},top=${pt},resizable=yes,scrollbars=yes`
            );

            if (!popup) {
                // Popup blocked — fall back to same-tab redirect
                window.location.href = authUrl.toString();
            }

            return { status: 'started', popup };
        }

        // ---- handle OAuth callback (call this on every page load) ----
        async function handleCallbackIfPresent() {
            const params = new URLSearchParams(window.location.search);
            const isCallback = params.get('oo2_cb') === '1';
            const code = params.get('code');
            const oauthError = params.get('error');

            if (!isCallback || (!code && !oauthError)) return false;

            // Clean URL immediately
            const cleanUrl = window.location.pathname;
            history.replaceState(null, '', cleanUrl);

            if (oauthError) {
                clearPending();
                throw new Error(`OAuth error: ${params.get('error_description') || oauthError}`);
            }

            const pending = readPending();
            const callbackState = params.get('state');

            if (!pending || pending.state !== callbackState) {
                clearPending();
                throw new Error('OAuth state mismatch — possible CSRF. Please try signing in again.');
            }

            // Exchange code for tokens via gmFetch (bypasses CORS)
            const resp = await gmFetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: pending.redirectUri,
                    client_id: CLIENT_ID,
                    code_verifier: pending.codeVerifier
                }).toString()
            });

            if (!resp.ok) {
                let detail = '';
                try { const err = await resp.json(); detail = err.error_description || err.error || ''; } catch { }
                clearPending();
                throw new Error(`Token exchange failed: HTTP ${resp.status}${detail ? ': ' + detail : ''}`);
            }

            const tokens = await resp.json();
            if (!tokens.access_token) {
                clearPending();
                throw new Error('Token exchange response missing access_token');
            }

            // Derive account ID from id_token JWT
            let accountId = 'unknown';
            try {
                const idToken = tokens.id_token || tokens.access_token;
                const parts = idToken.split('.');
                if (parts[1]) {
                    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    const auth = claims['https://api.openai.com/auth'] || {};
                    accountId = auth.chatgpt_account_id || claims.chatgpt_account_id || claims.sub || 'unknown';
                }
            } catch { }

            const session = {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                idToken: tokens.id_token,
                accountId,
                expiresAt: tokens.expires_in
                    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                    : undefined
            };
            setSession(session);
            clearPending();
            return true;
        }

        function logout() {
            clearSession();
        }

        return {
            isSignedIn,
            isExtensionInstalled,
            getSession,
            getAccessToken,
            initiateLogin,
            handleCallbackIfPresent,
            logout,
            EXT_ID
        };
    })();

    // ---- Handle OAuth callback immediately on page load ----
    if (window.location.search.includes('oo2_cb=1')) {
        OAuthLogin.handleCallbackIfPresent().then(handled => {
            if (!handled) return;
            console.log('[OAuthLogin] ✅ Signed in with ChatGPT successfully!');

            if (window.opener && !window.opener.closed) {
                // ── POPUP PATH ──
                // Tokens are now in localStorage (same origin as main window).
                // Just close the popup — the main window's poll loop will pick up the session.
                window.close();
            } else {
                // ── SAME-TAB FALLBACK ──
                // Popup was blocked, so we redirected the current tab.
                // Show a green toast so the user knows it worked.
                const toast = document.createElement('div');
                toast.style.cssText = [
                    'position:fixed', 'top:20px', 'left:50%',
                    'transform:translateX(-50%)',
                    'background:#22c55e', 'color:#000',
                    'padding:12px 28px', 'border-radius:10px',
                    'font-size:16px', 'font-weight:bold',
                    'z-index:999999',
                    'box-shadow:0 4px 20px rgba(34,197,94,0.4)',
                    'font-family:sans-serif'
                ].join(';');
                toast.textContent = '✅ Signed in with ChatGPT!';
                const attach = () => { document.body.appendChild(toast); setTimeout(() => toast.remove(), 3500); };
                if (document.body) attach();
                else document.addEventListener('DOMContentLoaded', attach);
            }
        }).catch(err => {
            console.error('[OAuthLogin] Callback error:', err);
            // If we're in a popup, close it on error too so it doesn't hang
            if (window.opener && !window.opener.closed) window.close();
        });
    }

    // ============================================
    // OPENAI PROVIDER MODULE (DYNAMIC MODEL LOADING)
    // ============================================

    const OpenAIProvider = (function () {
        'use strict';

        // ---- shared config ----
        const CONFIG = {
            // API key mode endpoint
            APIKEY_MODELS_URL: 'https://api.openai.com/v1/models',
            APIKEY_CHAT_URL: 'https://api.openai.com/v1/chat/completions',
            // Direct ChatGPT Codex endpoint (used when signed in via OAuthLogin)
            CHATGPT_CODEX_URL: 'https://chatgpt.com/backend-api/codex',
            // Separate caches for each mode
            CACHE_KEY_APIKEY: 'openai_models_cache',
            CACHE_KEY_OAUTH: 'openai_oauth_models_cache',
            CACHE_TTL_APIKEY: 6 * 60 * 60 * 1000,   // 6 hours
            CACHE_TTL_OAUTH: 20 * 60 * 1000,          // 20 min
            DEFAULT_MODEL_APIKEY: 'gpt-4o-mini',
            DEFAULT_MODEL_CHATGPT: 'gpt-5.4-mini',
            // Image-only model IDs to exclude from chat dropdown
            IMAGE_MODEL_IDS: new Set(['gpt-image-2', 'dall-e-3', 'dall-e-2'])
        };

        // Codex / ChatGPT-plan fallback models
        const OAUTH_FALLBACK_MODELS = [
            { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
            { id: 'gpt-5.5', name: 'GPT-5.5', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
            { id: 'gpt-5.4', name: 'GPT-5.4', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
            { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
            { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', category: 'GPT-5 (Codex)', ownedBy: 'openai' },
        ];

        // ---- helpers ----
        function getOAuthBaseUrl() {
            return (SETTINGS.openaiOAuthBaseUrl || 'http://127.0.0.1:10531/v1').replace(/\/$/, '');
        }

        function isChatGPTMode() {
            const m = SETTINGS.openaiAuthMode;
            // 'chatgpt' is the new mode, 'extension'/'oauth' are legacy names for the same thing
            return m === 'chatgpt' || m === 'oauth' || m === 'extension';
        }

        // isOAuthMode kept for compatibility with legacy code paths that check it
        function isOAuthMode() { return isChatGPTMode(); }
        function isExtensionMode() { return false; }


        function normalizeModel(rawModel) {
            const id = rawModel.id || '';
            let category = 'Other';
            let displayName = id;

            if (id.startsWith('gpt-5')) {
                category = 'GPT-5 (Codex)';
                displayName = id.replace('gpt-', 'GPT-').replace(/-/g, ' ');
            } else if (id.startsWith('gpt-4o')) {
                category = 'GPT-4o';
                displayName = id.replace('gpt-4o', 'GPT-4o').replace(/-/g, ' ');
            } else if (id.startsWith('gpt-4')) {
                category = 'GPT-4';
                displayName = id.replace('gpt-4', 'GPT-4').replace(/-/g, ' ');
            } else if (id.startsWith('gpt-3.5')) {
                category = 'GPT-3.5';
                displayName = id.replace('gpt-3.5', 'GPT-3.5').replace(/-/g, ' ');
            } else if (/^(o1|o3|o4)/.test(id)) {
                category = 'Reasoning (o-series)';
                displayName = id.toUpperCase().replace(/-/g, ' ');
            } else if (/davinci|curie|babbage|ada/.test(id)) {
                category = 'Legacy';
            }

            return {
                id: id,
                name: displayName,
                category: category,
                ownedBy: rawModel.owned_by || 'openai'
            };
        }

        function isChatCapable(model) {
            const id = (model.id || '').toLowerCase();
            // Exclude known image-only / non-chat model IDs
            if (CONFIG.IMAGE_MODEL_IDS.has(id)) return false;
            const excludePats = ['image', 'embed', 'tts', 'whisper', 'dall-e', 'realtime', 'audio', 'moderation'];
            return !excludePats.some(p => id.includes(p));
        }

        // ---- cache helpers ----
        function getCachedModels(key, ttl) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const { models, timestamp } = JSON.parse(raw);
                if (Date.now() - timestamp < ttl) return models;
            } catch (e) { /* ignore */ }
            return null;
        }

        function setCachedModels(key, models) {
            try {
                localStorage.setItem(key, JSON.stringify({ models, timestamp: Date.now() }));
            } catch (e) { /* ignore */ }
        }

        function clearCache() {
            localStorage.removeItem(CONFIG.CACHE_KEY_APIKEY);
            localStorage.removeItem(CONFIG.CACHE_KEY_OAUTH);
            localStorage.removeItem('openai_extension_models_cache');
        }

        // ---- model fetching ----
        async function fetchExtensionModels(forceRefresh = false) {
            if (!ExtensionBridge.isAvailable()) {
                return OAUTH_FALLBACK_MODELS.slice();
            }
            if (!forceRefresh) {
                const cached = getCachedModels('openai_extension_models_cache', 20 * 60 * 1000);
                if (cached) return cached;
            }
            try {
                const models = await ExtensionBridge.listModels();
                if (Array.isArray(models) && models.length > 0) {
                    setCachedModels('openai_extension_models_cache', models);
                    return models;
                }
            } catch (e) {
                console.warn('[OpenAI-Extension] Model fetch error:', e);
            }
            return OAUTH_FALLBACK_MODELS.slice();
        }

        async function fetchChatGPTModels(forceRefresh = false) {
            if (!forceRefresh) {
                const cached = getCachedModels(CONFIG.CACHE_KEY_OAUTH, CONFIG.CACHE_TTL_OAUTH);
                if (cached) {
                    console.log('[openai-oauth] Using cached models:', cached.length);
                    return cached;
                }
            }

            const session = OAuthLogin.getSession();
            if (session && session.accessToken) {
                // ── DIRECT BROWSER CALL FIRST ──
                try {
                    const clientVersion = "0.144.1";
                    const response = await gmFetch(`https://chatgpt.com/backend-api/codex/models?client_version=${clientVersion}`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${session.accessToken}`,
                            'chatgpt-account-id': session.accountId || ''
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const rawModels = Array.isArray(data.models) ? data.models : (Array.isArray(data.data) ? data.data : []);
                        const models = rawModels
                            .map(m => {
                                const norm = normalizeModel({ id: m.slug || m.id, ...m });
                                return {
                                    ...norm,
                                    useResponsesLite: m.use_responses_lite ?? false
                                };
                            })
                            .filter(m => m.id)
                            .sort((a, b) => {
                                const ord = ['GPT-5 (Codex)', 'GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Other'];
                                const ai = ord.indexOf(a.category), bi = ord.indexOf(b.category);
                                if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                                return a.name.localeCompare(b.name);
                            });

                        if (models.length > 0) {
                            setCachedModels(CONFIG.CACHE_KEY_OAUTH, models);
                            console.log('[openai-oauth] Direct fetched', models.length, 'models from OpenAI');
                            return models;
                        }
                    }
                } catch (e) {
                    console.warn('[openai-oauth] Direct model fetch failed:', e);
                }
            }

            // ── LOCAL PROXY FALLBACK ──
            const PROXY_URL = getOAuthBaseUrl(); // default: http://127.0.0.1:10531/v1
            try {
                const response = await gmFetch(`${PROXY_URL}/models`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json', 'Authorization': 'Bearer openai-oauth' }
                });

                if (response.ok) {
                    const data = await response.json();
                    const rawModels = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
                    const models = rawModels
                        .filter(m => m && m.id && isChatCapable(m))
                        .map(m => {
                            const norm = normalizeModel(m);
                            return {
                                ...norm,
                                useResponsesLite: m.use_responses_lite ?? m.useResponsesLite ?? false
                            };
                        })
                        .sort((a, b) => {
                            const ord = ['GPT-5 (Codex)', 'GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Other'];
                            const ai = ord.indexOf(a.category), bi = ord.indexOf(b.category);
                            if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                            return a.name.localeCompare(b.name);
                        });

                    if (models.length > 0) {
                        setCachedModels(CONFIG.CACHE_KEY_OAUTH, models);
                        console.log('[openai-oauth] Fetched', models.length, 'models from proxy');
                        return models;
                    }
                }
            } catch {
                console.warn('[openai-oauth] Proxy not reachable at', PROXY_URL);
            }

            console.warn('[openai-oauth] Both direct call and proxy offline — using fallback model list');
            return OAUTH_FALLBACK_MODELS.slice();
        }

        async function fetchApiKeyModels(forceRefresh = false) {
            const apiKey = SETTINGS.openaiApiKey;
            if (!apiKey) {
                console.log('[OpenAI] No API key, using fallback models');
                return getApiKeyFallbackModels();
            }

            if (!forceRefresh) {
                const cached = getCachedModels(CONFIG.CACHE_KEY_APIKEY, CONFIG.CACHE_TTL_APIKEY);
                if (cached) {
                    console.log('[OpenAI] Using cached models:', cached.length);
                    return cached;
                }
            }

            try {
                // Use gmFetch so api.openai.com works from HTTPS page context
                const response = await gmFetch(CONFIG.APIKEY_MODELS_URL, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                const rawModels = data.data || [];

                const chatModelPatterns = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'chatgpt'];
                const excludePatterns = ['instruct', 'audio', 'realtime', 'tts', 'whisper', 'dall-e', 'embedding', 'moderation'];

                const models = rawModels
                    .filter(m => {
                        const id = (m.id || '').toLowerCase();
                        return chatModelPatterns.some(p => id.includes(p)) &&
                            !excludePatterns.some(p => id.includes(p)) &&
                            isChatCapable(m);
                    })
                    .map(normalizeModel)
                    .sort((a, b) => {
                        const ord = ['GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Legacy', 'Other'];
                        const ai = ord.indexOf(a.category), bi = ord.indexOf(b.category);
                        if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                        return a.name.localeCompare(b.name);
                    });

                console.log('[OpenAI] Fetched models:', models.length);
                setCachedModels(CONFIG.CACHE_KEY_APIKEY, models);
                return models;
            } catch (error) {
                console.error('[OpenAI] Fetch error:', error);
                return getApiKeyFallbackModels();
            }
        }

        async function fetchModels(forceRefresh = false) {
            return isChatGPTMode() ? fetchChatGPTModels(forceRefresh) : fetchApiKeyModels(forceRefresh);
        }

        function getApiKeyFallbackModels() {
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
            const q = query.toLowerCase();
            return models.filter(m =>
                (m.id || '').toLowerCase().includes(q) ||
                (m.name || '').toLowerCase().includes(q) ||
                (m.category || '').toLowerCase().includes(q)
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

        // ---- unified completion (used by generateWithOpenAI) ----
        async function generateCompletion(messages, options = {}) {
            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Messages array is required');
            }

            const model = options.model || SETTINGS.openaiModel || CONFIG.DEFAULT_MODEL_CHATGPT;
            const temp = options.temperature ?? SETTINGS.aiTemperature;

            // Some Codex / o-series models reject temperature; omit for gpt-5* and o-series
            const skipTemp = /^(gpt-5|o1|o3|o4)/.test(model);
            const payload = { model, messages, ...(skipTemp ? {} : { temperature: temp }) };

            if (isChatGPTMode()) {
                const session = OAuthLogin.getSession();
                let directErrorMsg = 'Not signed in or session invalid.';
                if (session && session.accessToken) {
                    // Helper to extract text from Codex SSE stream
                    const parseSseText = (sseText) => {
                        let fullText = '';
                        const lines = sseText.split('\n');
                        for (let line of lines) {
                            line = line.trim();
                            if (line.startsWith('data:')) {
                                const dataStr = line.slice(5).trim();
                                if (dataStr === '[DONE]') continue;
                                try {
                                    const parsed = JSON.parse(dataStr);
                                    // Case A: delta text content (streaming)
                                    if (parsed.item && parsed.item.role === 'assistant' && Array.isArray(parsed.item.content)) {
                                        for (const c of parsed.item.content) {
                                            if (typeof c.text === 'string') {
                                                fullText += c.text;
                                            }
                                        }
                                    }
                                    // Case B: final completed payload (contains full response output)
                                    if (parsed.response && Array.isArray(parsed.response.output)) {
                                        for (const out of parsed.response.output) {
                                            if (out.role === 'assistant' && Array.isArray(out.content)) {
                                                let itemText = '';
                                                for (const c of out.content) {
                                                    if (typeof c.text === 'string') {
                                                        itemText += c.text;
                                                    }
                                                }
                                                if (itemText) return itemText; // Complete text found
                                            }
                                        }
                                    }
                                } catch (e) { }
                            }
                        }
                        return fullText;
                    };

                    // Format messages to Codex Input array structure
                    const codexInput = messages.map(msg => {
                        const role = msg.role === 'developer' || msg.role === 'system' ? 'system' : (msg.role === 'assistant' ? 'assistant' : 'user');
                        return {
                            role: role,
                            content: [{ type: 'input_text', text: msg.content }]
                        };
                    });

                    const codexPayload = {
                        model: model,
                        input: codexInput,
                        stream: true,
                        store: false,
                        instructions: "",
                        include: ["reasoning.encrypted_content"]
                    };

                    const directHeaders = {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
                        'Authorization': `Bearer ${session.accessToken}`,
                        'chatgpt-account-id': session.accountId || '',
                        'Origin': 'https://chatgpt.com',
                        'Referer': 'https://chatgpt.com/'
                    };

                    // ── DIRECT BROWSER CALL FIRST ──
                    try {
                        const directResp = await gmFetch('https://chatgpt.com/backend-api/codex/responses', {
                            method: 'POST',
                            headers: directHeaders,
                            body: JSON.stringify(codexPayload)
                        });

                        if (directResp.ok) {
                            const sseText = await directResp.text();
                            const fullText = parseSseText(sseText);
                            if (fullText) {
                                return fullText;
                            }
                            throw new Error('OpenAI returned an empty response stream.');
                        } else {
                            let detail = '';
                            try {
                                const errText = await directResp.text();
                                try {
                                    const parsed = JSON.parse(errText);
                                    detail = parsed?.detail || parsed?.message || parsed?.error?.message || errText;
                                } catch {
                                    detail = errText;
                                }
                            } catch { }
                            throw new Error(`Server returned HTTP ${directResp.status}${detail ? ': ' + detail : ''}`);
                        }
                    } catch (e) {
                        directErrorMsg = e.message || String(e);
                        console.warn('[openai-oauth] Direct responses call threw error:', e);
                    }
                }

                // ── LOCAL PROXY FALLBACK ──
                const PROXY_URL = getOAuthBaseUrl(); // http://127.0.0.1:10531/v1
                let proxyResp;
                try {
                    proxyResp = await gmFetch(`${PROXY_URL}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer openai-oauth'
                        },
                        body: JSON.stringify(payload)
                    });
                } catch (e) {
                    throw new Error(
                        '❌ OpenAI request failed.\n\n' +
                        'Direct Browser Call failed:\n' +
                        '   ' + directErrorMsg + '\n\n' +
                        'Local Proxy Error:\n' +
                        '   openai-oauth proxy is not running.\n' +
                        '   To run the proxy locally, run: npx openai-oauth'
                    );
                }

                if (proxyResp.status === 401 || proxyResp.status === 403) {
                    throw new Error(
                        '❌ Not signed in to ChatGPT.\n\n' +
                        'Please sign in via the extension in the Settings (⚙) panel.'
                    );
                }

                if (!proxyResp.ok) {
                    let detail = '';
                    try { const err = await proxyResp.json(); detail = err?.error?.message || ''; } catch { }
                    throw new Error(`[openai-oauth] Proxy error: HTTP ${proxyResp.status}${detail ? ': ' + detail : ''}`);
                }

                const proxyData = await proxyResp.json();
                const proxyContent = proxyData.choices?.[0]?.message?.content;
                if (!proxyContent) throw new Error('[openai-oauth] Proxy returned an empty response');
                return proxyContent;

            } else {
                // API key mode — route through gmFetch so @connect api.openai.com applies
                const apiKey = SETTINGS.openaiApiKey;
                if (!apiKey) {
                    throw new Error('OpenAI API key not configured. Please add it in settings.');
                }

                let response;
                try {
                    response = await gmFetch(CONFIG.APIKEY_CHAT_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(payload)
                    });
                } catch (netErr) {
                    throw new Error(`OpenAI network error: ${netErr.message}`);
                }

                if (!response.ok) {
                    let errMsg = `OpenAI API request failed: HTTP ${response.status}`;
                    try {
                        const err = await response.json();
                        if (err.error?.message) errMsg = err.error.message;
                    } catch { }
                    throw new Error(errMsg);
                }

                const data = await response.json();
                return data.choices?.[0]?.message?.content || '';
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
            isOAuthMode,
            isChatGPTMode,
            getOAuthBaseUrl,
            OAUTH_FALLBACK_MODELS
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
    const generateWithG4F = async (prompt, systemInstruction = '') => {
        const model = SETTINGS.g4fModel || 'auto';
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : '');
        const messages = [];
        if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
        messages.push({ role: 'user', content: prompt });
        return await G4FProvider.generateCompletion(
            messages,
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
    const generateWithDuckDuckGo = async (prompt, systemInstruction = '') => {
        const model = SETTINGS.duckduckgoModel || 'gpt-4o-mini';
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : '');
        const messages = [];
        if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
        messages.push({ role: 'user', content: prompt });
        return await DuckDuckGoProvider.generateCompletion(
            messages,
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
    const generateWithYuppBridge = async (prompt, systemInstruction = '') => {
        const model = SETTINGS.yuppbridgeModel || 'gpt-4o';
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : '');
        const messages = [];
        if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
        messages.push({ role: 'user', content: prompt });
        return await YuppBridgeProvider.generateCompletion(
            messages,
            { model: model, temperature: SETTINGS.aiTemperature, max_tokens: 2048 }
        );
    };

    // ============================================
    // NVIDIA NIM PROVIDER MODULE (DYNAMIC MODEL LOADING)
    // ============================================

    const NvidiaProvider = (function () {
        'use strict';

        const CONFIG = {
            BASE_URL: 'https://integrate.api.nvidia.com/v1',
            MODELS_URL: 'https://integrate.api.nvidia.com/v1/models',
            CHAT_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
            CACHE_KEY: 'nvidia_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours
            DEFAULT_MODEL: 'deepseek-ai/deepseek-v4-pro'
        };

        // Publisher → category mapping for grouping
        const PUBLISHER_GROUP = {
            'z-ai': 'Z.ai',
            'nvidia': 'NVIDIA',
            'deepseek-ai': 'DeepSeek',
            'google': 'Google',
            'mistralai': 'Mistral',
            'moonshotai': 'Moonshot',
            'minimaxai': 'MiniMax',
            'qwen': 'Qwen',
            'stepfun-ai': 'StepFun'
        };

        // Static fallback catalog — used when API key is absent or fetch fails
        const FALLBACK_MODELS = [
            { id: "abacusai/dracarys-llama-3.1-70b-instruct", name: "Dracarys Llama 3.1 70B Instruct", group: "Abacus", tags: "", context: "-" },
            { id: "ai21labs/jamba-1.5-large-instruct", name: "Jamba 1.5 Large Instruct", group: "AI21", tags: "", context: "-" },
            { id: "bytedance/seed-oss-36b-instruct", name: "Seed Oss 36B Instruct", group: "ByteDance", tags: "", context: "-" },
            { id: "deepseek-ai/deepseek-v4-flash", name: "Deepseek V4 Flash", group: "DeepSeek", tags: "MoE, Coding, Agents", context: "1M" },
            { id: "deepseek-ai/deepseek-v4-pro", name: "Deepseek V4 Pro", group: "DeepSeek", tags: "MoE, Coding", context: "1M" },
            { id: "google/gemma-2-2b-it", name: "Gemma 2 2B It", group: "Google", tags: "", context: "-" },
            { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-3.2-11b-vision-instruct", name: "Llama 3.2 11B Vision Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-3.2-90b-vision-instruct", name: "Llama 3.2 90B Vision Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick 17B 128E Instruct", group: "Meta", tags: "", context: "-" },
            { id: "meta/llama2-70b", name: "Llama2 70B", group: "Meta", tags: "", context: "-" },
            { id: "mistralai/ministral-14b-instruct-2512", name: "Ministral 14B Instruct 2512", group: "Mistral", tags: "", context: "-" },
            { id: "mistralai/mistral-large-3-675b-instruct-2512", name: "Mistral Large 3 675B Instruct 2512", group: "Mistral", tags: "", context: "-" },
            { id: "mistralai/mistral-medium-3.5-128b", name: "Mistral Medium 3.5 128B", group: "Mistral", tags: "Text Gen, Coding, Agentic", context: "128K" },
            { id: "mistralai/mistral-nemotron", name: "Mistral Nemotron", group: "Mistral", tags: "", context: "-" },
            { id: "mistralai/mistral-small-4-119b-2603", name: "Mistral Small 4 119B 2603", group: "Mistral", tags: "Hybrid MoE, Multimodal", context: "256K" },
            { id: "mistralai/mixtral-8x7b-instruct-v0.1", name: "Mixtral 8X7B Instruct V0.1", group: "Mistral", tags: "", context: "-" },
            { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", group: "Moonshot", tags: "Multimodal MoE, Agentic", context: "-" },
            { id: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", name: "Llama 3.1 Nemotron Nano Vl 8B V1", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/llama-3.3-nemotron-super-49b-v1", name: "Llama 3.3 Nemotron Super 49B V1", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", name: "Llama 3.3 Nemotron Super 49B V1.5", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/nemotron-3-nano-30b-a3b", name: "Nemotron 3 Nano 30B A3B", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", name: "Nemotron 3 Nano Omni 30B A3B Reasoning", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B A12B", group: "NVIDIA", tags: "MoE, Coding, Planning", context: "1M" },
            { id: "nvidia/nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra 550B A55B", group: "NVIDIA", tags: "Agent, MoE, Tool Calling", context: "1M" },
            { id: "nvidia/nemotron-mini-4b-instruct", name: "Nemotron Mini 4B Instruct", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/nemotron-nano-12b-v2-vl", name: "Nemotron Nano 12B V2 Vl", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/nvidia-nemotron-nano-9b-v2", name: "Nvidia Nemotron Nano 9B V2", group: "NVIDIA", tags: "", context: "-" },
            { id: "nvidia/vila", name: "Vila", group: "NVIDIA", tags: "", context: "-" },
            { id: "openai/gpt-oss-120b", name: "Gpt Oss 120B", group: "OpenAI", tags: "", context: "-" },
            { id: "openai/gpt-oss-20b", name: "Gpt Oss 20B", group: "OpenAI", tags: "", context: "-" },
            { id: "qwen/qwen3.5-122b-a10b", name: "Qwen3.5 122B A10B", group: "Qwen", tags: "", context: "-" },
            { id: "sarvamai/sarvam-m", name: "Sarvam M", group: "Sarvam", tags: "", context: "-" },
            { id: "stepfun-ai/step-3.5-flash", name: "Step 3.5 Flash", group: "StepFun", tags: "", context: "-" },
            { id: "stepfun-ai/step-3.7-flash", name: "Step 3.7 Flash", group: "StepFun", tags: "", context: "-" },
            { id: "stockmark/stockmark-2-100b-instruct", name: "Stockmark 2 100B Instruct", group: "Stockmark", tags: "", context: "-" },
            { id: "upstage/solar-10.7b-instruct", name: "Solar 10.7B Instruct", group: "Upstage", tags: "", context: "-" },
            { id: "z-ai/glm-5.2", name: "Glm 5.2", group: "Z.ai", tags: "Agentic, Coding, Reasoning", context: "16K" }
        ];

        function getApiKey() {
            const key = (SETTINGS.nvidiaApiKey || '').trim();
            return key || null;
        }

        // Basic key format validation — nvapi- prefix
        function validateApiKey(key) {
            if (!key) return false;
            // NVIDIA NIM API keys start with "nvapi-"
            return key.startsWith('nvapi-') && key.length > 20;
        }

        function normalizeModel(rawModel) {
            const id = rawModel.id || '';
            const publisher = id.split('/')[0] || 'other';
            const group = PUBLISHER_GROUP[publisher.toLowerCase()] || 'Other';
            const shortName = id.includes('/') ? id.split('/').pop() : id;

            // Derive display name — prettify the model ID
            const displayName = rawModel.name || shortName
                .replace(/-/g, ' ')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());

            return {
                id,
                name: displayName,
                group,
                ownedBy: rawModel.owned_by || publisher,
                tags: '',
                context: ''
            };
        }

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (!cached) return null;
                const { models, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CONFIG.CACHE_TTL) return models;
                localStorage.removeItem(CONFIG.CACHE_KEY);
            } catch (e) {
                try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (_) { }
            }
            return null;
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ models, timestamp: Date.now() }));
            } catch (e) {
                console.warn('[NVIDIA] Cache write error:', e);
            }
        }

        function clearCache() {
            try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (e) { }
        }

        async function fetchModels(forceRefresh = false) {
            const apiKey = getApiKey();

            if (!forceRefresh) {
                const cached = getCachedModels();
                if (cached && cached.length > 0) {
                    console.log('[NVIDIA] Using cached models:', cached.length);
                    return cached;
                }
            }

            if (!apiKey) {
                console.log('[NVIDIA] No API key — using fallback catalog');
                return FALLBACK_MODELS.slice();
            }

            if (!validateApiKey(apiKey)) {
                console.warn('[NVIDIA] API key format invalid (should start with nvapi-)');
                return FALLBACK_MODELS.slice();
            }

            console.log('[NVIDIA] Fetching models from API...');
            let response;
            try {
                response = await gmFetch(CONFIG.MODELS_URL, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (networkErr) {
                console.warn('[NVIDIA] Network error while fetching models:', networkErr.message);
                return FALLBACK_MODELS.slice();
            }

            if (!response.ok) {
                let detail = '';
                try {
                    const errBody = await response.json();
                    detail = errBody?.detail || errBody?.message || errBody?.error?.message || '';
                } catch (_) {
                    try { detail = await response.text(); } catch (_2) { }
                }
                if (response.status === 401) {
                    console.warn('[NVIDIA] 401 Unauthorized — check your API key at build.nvidia.com');
                } else if (response.status === 429) {
                    console.warn('[NVIDIA] 429 Rate limit exceeded');
                } else {
                    console.warn(`[NVIDIA] Models API HTTP ${response.status}${detail ? ': ' + detail : ''} — using fallback`);
                }
                return FALLBACK_MODELS.slice();
            }

            let rawResponse;
            try {
                rawResponse = await response.json();
            } catch (parseErr) {
                console.warn('[NVIDIA] Failed to parse models JSON:', parseErr.message);
                return FALLBACK_MODELS.slice();
            }

            // OpenAI-compatible: { data: [{id, owned_by}, ...] }
            const modelArray = Array.isArray(rawResponse?.data)
                ? rawResponse.data
                : Array.isArray(rawResponse) ? rawResponse : [];

            if (modelArray.length === 0) {
                console.warn('[NVIDIA] Fetched 0 models — using fallback catalog');
                return FALLBACK_MODELS.slice();
            }

            // Exclude non-chat models (embeddings, image, etc.)
            const excludePatterns = /embed|vision|diffusion|tts|whisper|moderation|image|audio|clip|owl/i;
            // Filter to verified free-tier coding models
            const VERIFIED_FREE_MODELS = new Set([
                "abacusai/dracarys-llama-3.1-70b-instruct",
                "ai21labs/jamba-1.5-large-instruct",
                "bytedance/seed-oss-36b-instruct",
                "deepseek-ai/deepseek-v4-flash",
                "deepseek-ai/deepseek-v4-pro",
                "google/gemma-2-2b-it",
                "meta/llama-3.1-70b-instruct",
                "meta/llama-3.1-8b-instruct",
                "meta/llama-3.2-11b-vision-instruct",
                "meta/llama-3.2-1b-instruct",
                "meta/llama-3.2-3b-instruct",
                "meta/llama-3.2-90b-vision-instruct",
                "meta/llama-4-maverick-17b-128e-instruct",
                "meta/llama2-70b",
                "mistralai/ministral-14b-instruct-2512",
                "mistralai/mistral-large-3-675b-instruct-2512",
                "mistralai/mistral-medium-3.5-128b",
                "mistralai/mistral-nemotron",
                "mistralai/mistral-small-4-119b-2603",
                "mistralai/mixtral-8x7b-instruct-v0.1",
                "moonshotai/kimi-k2.6",
                "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
                "nvidia/llama-3.3-nemotron-super-49b-v1",
                "nvidia/llama-3.3-nemotron-super-49b-v1.5",
                "nvidia/nemotron-3-nano-30b-a3b",
                "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
                "nvidia/nemotron-3-super-120b-a12b",
                "nvidia/nemotron-3-ultra-550b-a55b",
                "nvidia/nemotron-mini-4b-instruct",
                "nvidia/nemotron-nano-12b-v2-vl",
                "nvidia/nvidia-nemotron-nano-9b-v2",
                "nvidia/vila",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3.5-122b-a10b",
                "sarvamai/sarvam-m",
                "stepfun-ai/step-3.5-flash",
                "stepfun-ai/step-3.7-flash",
                "stockmark/stockmark-2-100b-instruct",
                "upstage/solar-10.7b-instruct",
                "z-ai/glm-5.2"
            ]);
            const normalized = modelArray
                .filter(m => m && m.id && VERIFIED_FREE_MODELS.has(m.id))
                .map(m => normalizeModel(m))
                .sort((a, b) => {
                    if (a.group !== b.group) return a.group.localeCompare(b.group);
                    return a.name.localeCompare(b.name);
                });

            // Merge tags/context from fallback catalog for known models
            const fallbackMap = {};
            FALLBACK_MODELS.forEach(m => { fallbackMap[m.id] = m; });
            normalized.forEach(m => {
                const fb = fallbackMap[m.id];
                if (fb) {
                    m.tags = fb.tags;
                    m.context = fb.context;
                }
            });

            console.log('[NVIDIA] Fetched models:', normalized.length);
            setCachedModels(normalized);
            return normalized;
        }

        function filterModels(models, query) {
            if (!query || !Array.isArray(models)) return models || [];
            const q = query.toLowerCase().trim();
            if (!q) return models;
            return models.filter(m =>
                (m.id || '').toLowerCase().includes(q) ||
                (m.name || '').toLowerCase().includes(q) ||
                (m.group || '').toLowerCase().includes(q) ||
                (m.tags || '').toLowerCase().includes(q)
            );
        }

        function groupModels(models) {
            const groups = {};
            (models || []).forEach(m => {
                const g = m.group || 'Other';
                if (!groups[g]) groups[g] = [];
                groups[g].push(m);
            });
            return groups;
        }

        return { CONFIG, fetchModels, filterModels, groupModels, clearCache, validateApiKey, FALLBACK_MODELS };
    })();

    // ==============================================================
    // OMNIROUTE PROVIDER (Self-Hosted OpenAI-Compatible Gateway)
    // ==============================================================
    const OmniRouteProvider = (() => {
        const CONFIG = {
            BASE_URL: () => (SETTINGS.omnirouteBaseUrl || 'http://localhost:20128/v1').replace(/\/$/, ''),
            MODELS_URL: () => `${CONFIG.BASE_URL()}/models`,
            CHAT_URL: () => `${CONFIG.BASE_URL()}/chat/completions`,
            CACHE_KEY: 'omniroute_models_cache',
            CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours
            DEFAULT_MODEL: 'cl/nvidia/nemotron-3-ultra-550b-a55b:free'
        };

        function getCachedModels() {
            try {
                const cached = localStorage.getItem(CONFIG.CACHE_KEY);
                if (!cached) return null;
                const { timestamp, models } = JSON.parse(cached);
                if (Date.now() - timestamp > CONFIG.CACHE_TTL) return null;
                return models;
            } catch (_) { return null; }
        }

        function setCachedModels(models) {
            try {
                localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ timestamp: Date.now(), models }));
            } catch (_) { }
        }

        function clearCache() {
            try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch (_) { }
        }

        function normalizeModel(raw) {
            const id = raw.id || raw.model || '';
            const name = raw.name || raw.id || id;
            let group = 'OmniRoute';
            if (id.startsWith('oc/') || id.startsWith('opencode/')) group = 'OpenCode';
            else if (id.startsWith('agy/') || id.startsWith('antigravity/')) group = 'Antigravity';
            else if (id.startsWith('kr/') || id.startsWith('kiro/')) group = 'Kiro';
            else if (id.startsWith('qwen') || id.startsWith('Qwen')) group = 'Qwen';
            else if (id.startsWith('deepseek') || id.startsWith('DeepSeek')) group = 'DeepSeek';
            else if (id.startsWith('claude') || id.startsWith('Claude')) group = 'Claude';
            else if (id.startsWith('gemini') || id.startsWith('Gemini')) group = 'Gemini';
            else if (id.startsWith('gpt') || id.startsWith('GPT') || id.startsWith('o1') || id.startsWith('o3')) group = 'OpenAI';
            else if (id.startsWith('llama') || id.startsWith('Llama')) group = 'Llama';
            else if (id.startsWith('nemotron') || id.startsWith('Nemotron')) group = 'Nemotron';
            else if (id.startsWith('glm') || id.startsWith('GLM')) group = 'GLM';
            else if (id.startsWith('minimax') || id.startsWith('MiniMax')) group = 'MiniMax';
            return { id, name, group, tags: raw.tags || '', context: raw.context_window || raw.max_tokens || '' };
        }

        async function fetchModels(forceRefresh = false) {
            if (!forceRefresh) {
                const cached = getCachedModels();
                if (cached) return cached;
            }

            const apiKey = (SETTINGS.omnirouteApiKey || '').trim();
            if (!apiKey) {
                console.warn('[OmniRoute] No API key configured, using default model list');
                return getCachedModels() || [normalizeModel({ id: CONFIG.DEFAULT_MODEL })];
            }

            try {
                const response = await gmFetch(CONFIG.MODELS_URL(), {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                const rawResponse = await response.json();
                let modelArray = Array.isArray(rawResponse?.data) ? rawResponse.data : (Array.isArray(rawResponse) ? rawResponse : []);

                if (modelArray.length === 0) {
                    console.warn('[OmniRoute] Fetched 0 models — using cached or default');
                    return getCachedModels() || [normalizeModel({ id: CONFIG.DEFAULT_MODEL })];
                }

                const normalized = modelArray
                    .filter(m => m && m.id)
                    .map(normalizeModel)
                    .sort((a, b) => {
                        if (a.group !== b.group) return a.group.localeCompare(b.group);
                        return a.name.localeCompare(b.name);
                    });

                console.log('[OmniRoute] Fetched models:', normalized.length);
                setCachedModels(normalized);
                return normalized;
            } catch (error) {
                console.error('[OmniRoute] Failed to fetch models:', error.message);
                const cached = getCachedModels();
                if (cached) return cached;
                return [normalizeModel({ id: CONFIG.DEFAULT_MODEL })];
            }
        }

        function filterModels(models, query) {
            if (!query || !Array.isArray(models)) return models || [];
            const q = query.toLowerCase().trim();
            if (!q) return models;
            return models.filter(m =>
                (m.id || '').toLowerCase().includes(q) ||
                (m.name || '').toLowerCase().includes(q) ||
                (m.group || '').toLowerCase().includes(q) ||
                (m.tags || '').toLowerCase().includes(q)
            );
        }

        function groupModels(models) {
            const groups = {};
            (models || []).forEach(m => {
                const g = m.group || 'Other';
                if (!groups[g]) groups[g] = [];
                groups[g].push(m);
            });
            return groups;
        }

        return { CONFIG, fetchModels, filterModels, groupModels, clearCache };
    })();

    // OmniRoute completion helper
    const generateWithOmniRoute = async (prompt, systemInstruction = '') => {
        const apiKey = (SETTINGS.omnirouteApiKey || '').trim();
        if (!apiKey) {
            throw new Error('OmniRoute API key not configured. Set OMNIROUTE_API_KEY env var or add it in settings.');
        }

        const model = SETTINGS.omnirouteModel || OmniRouteProvider.CONFIG.DEFAULT_MODEL;
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : '');
        const messages = [];
        if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
        messages.push({ role: 'user', content: prompt });

        let response;
        try {
            response = await gmFetch(OmniRouteProvider.CONFIG.CHAT_URL(), {
                method: 'POST',
                timeout: 180000,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: SETTINGS.aiTemperature || 0.1,
                    top_p: 1,
                    max_tokens: 16384,
                    stream: false
                })
            });
        } catch (networkErr) {
            if (networkErr.message.includes('timeout')) {
                throw new Error(`OmniRoute: Request timed out. The local LLM backend at ${OmniRouteProvider.CONFIG.BASE_URL()} took longer than 180s to respond. Check if OmniRoute/local model server is responsive or select a faster model.`);
            }
            if (networkErr.message.includes('ECONNREFUSED') || networkErr.message.includes('Failed to fetch') || networkErr.message.includes('NetworkError')) {
                throw new Error('OmniRoute: Cannot connect to gateway at ' + OmniRouteProvider.CONFIG.BASE_URL() + '. Is OmniRoute running on port 20128?');
            }
            throw new Error(`OmniRoute network error: ${networkErr.message}`);
        }

        if (!response.ok) {
            let detail = '';
            try {
                const errBody = await response.json();
                detail = errBody?.detail || errBody?.message || errBody?.error?.message || '';
            } catch (_) {
                try { detail = await response.text(); } catch (_2) { }
            }

            if (response.status === 401) {
                throw new Error('OmniRoute: Invalid API key. Check your OMNIROUTE_API_KEY.');
            } else if (response.status === 404) {
                throw new Error(`OmniRoute: Model "${model}" not found. Refresh models list in settings.`);
            } else if (response.status === 429) {
                throw new Error('OmniRoute: Rate limit exceeded. Please wait before retrying.');
            } else if (response.status === 500 || response.status === 503) {
                throw new Error(`OmniRoute: Service unavailable (${response.status}). Check gateway logs.`);
            } else {
                throw new Error(`OmniRoute HTTP ${response.status}${detail ? ': ' + detail : ''}`);
            }
        }

        const data = await response.json();
        return data?.choices?.[0]?.message?.content || '';
    };

    // NVIDIA NIM completion helper
    const generateWithNvidia = async (prompt, systemInstruction = '') => {
        const apiKey = (SETTINGS.nvidiaApiKey || '').trim();
        if (!apiKey) {
            throw new Error('NVIDIA NIM API key not configured. Get a free key at build.nvidia.com.');
        }
        if (!NvidiaProvider.validateApiKey(apiKey)) {
            throw new Error('NVIDIA NIM API key appears invalid (should start with nvapi-). Check settings.');
        }

        const model = SETTINGS.nvidiaModel || NvidiaProvider.CONFIG.DEFAULT_MODEL;
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : '');
        const messages = [];
        if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
        messages.push({ role: 'user', content: prompt });

        let response;
        try {
            response = await gmFetch(NvidiaProvider.CONFIG.CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: SETTINGS.aiTemperature || 0.1,
                    top_p: 1,
                    max_tokens: 16384,
                    stream: false
                })
            });
        } catch (networkErr) {
            throw new Error(`NVIDIA NIM network error: ${networkErr.message}`);
        }

        if (!response.ok) {
            let detail = '';
            try {
                const errBody = await response.json();
                detail = errBody?.detail || errBody?.message || errBody?.error?.message || '';
            } catch (_) {
                try { detail = await response.text(); } catch (_2) { }
            }

            if (response.status === 401) {
                throw new Error('NVIDIA NIM: Invalid API key. Verify your key at build.nvidia.com.');
            } else if (response.status === 429) {
                throw new Error('NVIDIA NIM: Rate limit exceeded. Please wait before retrying.');
            } else if (response.status === 500 || response.status === 503) {
                throw new Error(`NVIDIA NIM: Service unavailable (${response.status}). Try again shortly.`);
            } else {
                throw new Error(`NVIDIA NIM HTTP ${response.status}${detail ? ': ' + detail : ''}`);
            }
        }

        const data = await response.json();
        return data?.choices?.[0]?.message?.content || '';
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
        settingsBtn.innerHTML = `<img src="data:image/png;base64,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" alt="Settings" style="width:46px;height:46px;object-fit:cover;border-radius:50%;display:block;transition:transform 0.3s ease,filter 0.3s ease;">`;
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
            padding: 8px 20px 6px;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(15,15,15,0) 60%);
            border-radius: 18px 18px 0 0;
        `;
        panelHeader.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#ef4444" style="flex-shrink:0;opacity:0.7;"><path d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                <small style="color:#6e6e77;font-size:13px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Configure features &amp; AI providers</small>
            </div>
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

        // FastAPI Questions Panel toggle
        const fastAPIQuestionsToggle = createToggle('enableFastAPIQuestions', 'FastAPI Questions', SETTINGS.enableFastAPIQuestions, 'Show incomplete questions from local FastAPI scraper (http://127.0.0.1:8000)');
        panelContent.appendChild(fastAPIQuestionsToggle);
        const fastAPIQuestionsCheckbox = fastAPIQuestionsToggle.querySelector('input');
        fastAPIQuestionsCheckbox.addEventListener('change', () => {
            if (fastAPIQuestionsCheckbox.checked) {
                if (window.FastAPIQuestionsPanel) {
                    window.FastAPIQuestionsPanel.init();
                }
            } else {
                if (window.FastAPIQuestionsPanel) {
                    window.FastAPIQuestionsPanel.destroy();
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
                <option value="openai" ${SETTINGS.aiProvider === 'openai' ? 'selected' : ''}>OpenAI / ChatGPT OAuth</option>
                <option value="openrouter" ${SETTINGS.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter (Multi-Model)</option>
                <option value="puter" ${SETTINGS.aiProvider === 'puter' ? 'selected' : ''}>Puter.js (Free, Unlimited)</option>
                <option value="g4f" ${SETTINGS.aiProvider === 'g4f' ? 'selected' : ''}>G4F (g4f.space)</option>
                <option value="duckduckgo" ${SETTINGS.aiProvider === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo AI (FREE!)</option>
                <option value="yuppbridge" ${SETTINGS.aiProvider === 'yuppbridge' ? 'selected' : ''}>YuppBridge (200+ Models)</option>
                <option value="nvidia" ${SETTINGS.aiProvider === 'nvidia' ? 'selected' : ''}>NVIDIA NIM (Free Tier)</option>
                <option value="omniroute" ${SETTINGS.aiProvider === 'omniroute' ? 'selected' : ''}>OmniRoute (Self-Hosted Gateway)</option>
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
            const nvidiaModelWrapper = document.getElementById('nvidia-model-wrapper');
            if (nvidiaModelWrapper) {
                nvidiaModelWrapper.style.display = providerSelect.value === 'nvidia' ? 'block' : 'none';
            }
            const omnirouteModelWrapper = document.getElementById('omniroute-model-wrapper');
            if (omnirouteModelWrapper) {
                omnirouteModelWrapper.style.display = providerSelect.value === 'omniroute' ? 'block' : 'none';
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

        // ========== OPENAI / CHATGPT SETTINGS (EXTENSION / PROXY / API KEY) ==========
        const createOpenAISettings = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'openai-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'openai' ? 'block' : 'none'};`;

            // Normalize legacy modes
            const rawMode = SETTINGS.openaiAuthMode || 'chatgpt';
            const currentMode = (rawMode === 'extension' || rawMode === 'oauth') ? 'chatgpt' : rawMode;
            const currentApiKey = SETTINGS.openaiApiKey || '';

            const CHATGPT_LOGO_SVG = `<svg width="18" height="18" viewBox="0 0 1412 1412" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;"><path d="M597.462 0.857699C673.717 -4.5771 755.535 16.0618 820.557 55.7878C839.621 67.4347 853.532 77.8804 870.903 91.7881C915.947 83.6597 962.083 83.5966 1007.15 91.601C1108.64 109.677 1198.75 167.436 1257.54 252.101C1315.95 336.355 1338.56 440.326 1320.41 541.218C1348.4 575.095 1369.47 609.408 1385.5 650.519C1422.8 746.143 1420.65 852.641 1379.53 946.681C1345.7 1023.88 1287.62 1087.95 1214.08 1129.17C1193.85 1140.47 1177.72 1147.33 1156.35 1155.65C1150.8 1167.38 1146.43 1180.08 1140.53 1192.52C1124.33 1226.23 1103.33 1257.42 1078.21 1285.12C1009.53 1360.77 913.675 1406.14 811.622 1411.3C797.103 1412.74 770.195 1411.71 755.535 1410.39C669.671 1402.64 607.216 1373.41 541.228 1320.14C498.371 1327.97 454.491 1328.42 411.479 1321.49C309.519 1305.16 218.308 1248.8 158.127 1164.91C95.5192 1077.93 74.597 975.652 91.7694 870.624C63.5815 837.852 41.1539 800.536 25.4414 760.272C-11.0983 663.999 -8.18036 557.204 33.5617 463.069C77.8418 363.472 155.004 295.015 255.809 256.181C260.004 248.164 265.705 231.947 270.502 221.837C286.044 188.764 306.234 158.081 330.46 130.717C398.638 53.6473 494.725 6.91416 597.462 0.857699ZM803.624 1297.49C879.882 1292.64 946.234 1261.95 997.071 1204.28C1015.09 1183.82 1029.9 1160.75 1041.02 1135.85C1047.58 1121.23 1051.8 1106.22 1056.86 1091.08C1067.19 1060.2 1088.78 1058.15 1115.61 1048.88C1125.47 1045.52 1135.09 1041.52 1144.43 1036.9C1243.91 988.43 1304.38 884.819 1297.64 774.394C1294 716.163 1271.8 660.631 1234.27 615.946C1223.26 602.711 1208.28 591.435 1203.34 574.896C1197.16 554.244 1207.83 529.807 1210.67 506.759C1221.87 416.705 1187.69 326.959 1119.41 267.154C1064.95 219.454 993.758 195.357 921.517 200.173C909.062 200.932 896.689 202.63 884.487 205.252C858.307 210.809 839.711 217.803 816.524 196.759C802.123 183.693 793.783 175.007 777.726 163.451C738.141 135.075 691.432 118.286 642.835 114.967C634.456 114.329 619.975 113.369 611.816 114.357C536.156 118.188 468.827 147.965 417.756 204.614C399.016 225.371 383.578 248.884 371.981 274.328C368.409 282.286 365.23 290.414 362.455 298.682C357.28 314.179 354.556 330.003 342.859 342.026C330.473 354.758 314.132 357.158 297.998 362.604C288.467 365.803 279.144 369.592 270.084 373.948C170.322 421.514 108.992 524.42 114.64 634.77C117.764 693.592 139.719 749.855 177.266 795.249C188.357 808.68 203.749 820.374 208.712 836.975C214.929 857.779 204.623 882.481 201.669 905.586C190.625 994.243 223.634 1082.71 290.065 1142.47C341.827 1188.92 413.829 1216.16 483.523 1212.31C496.702 1211.71 509.821 1210.17 522.783 1207.71C549.917 1202.44 573.428 1193.61 595.85 1215.61C654.397 1273.04 720.807 1298.82 803.624 1297.49Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M528.104 673.1C645.003 673.1 739.769 767.837 739.769 884.701C739.769 1001.56 645.003 1096.3 528.104 1096.3C411.204 1096.3 316.439 1001.56 316.439 884.701C316.439 767.837 411.204 673.1 528.104 673.1ZM526.618 785.954C472.886 785.954 429.327 829.499 429.327 883.216C429.327 936.932 472.886 980.478 526.618 980.478C580.351 980.478 623.91 936.932 623.91 883.216C623.91 829.499 580.351 785.954 526.618 785.954Z"/><path d="M974.454 335.733L1055.33 416.583L688.769 783.031L607.895 702.182L974.454 335.733Z"/><path d="M820.585 766.758L704.525 767.283L821.11 650.733L820.585 766.758Z"/><path d="M937.694 649.684L821.11 650.733L938.744 533.135L937.694 649.684Z"/><path d="M1054.8 532.611L938.744 533.135L1055.33 416.586L1054.8 532.611Z"/><path d="M1054.8 336.259L1055.33 416.583L974.454 335.733L1054.8 336.259Z"/></svg>`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    ${CHATGPT_LOGO_SVG}
                    OpenAI / ChatGPT
                </div>
                <div style="color: #666; font-size: 12px; margin-bottom: 12px; line-height: 1.5;">
                    Turn your ChatGPT account into a free API &mdash; no API key needed.
                </div>

                <!-- Auth mode tabs -->
                <div style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
                    <label id="oai-mode-chatgpt-label" style="display: flex; align-items: center; gap: 8px; padding: 6px 16px 6px 12px; border-radius: 100px; cursor: pointer; border: 2px solid ${currentMode === 'chatgpt' ? '#22c55e' : '#444'}; background: ${currentMode === 'chatgpt' ? '#0f2a0f' : '#2a2a2a'}; transition: all 0.2s; overflow: hidden;">
                        <input type="radio" name="openaiAuthMode" id="oai-mode-chatgpt" value="chatgpt" ${currentMode === 'chatgpt' ? 'checked' : ''} style="margin: 0; flex-shrink: 0;">
                        <img src="data:image/png;base64,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" alt="Sign in with ChatGPT" style="height: 28px; width: auto; display: block; border-radius: 100px; pointer-events: none;">
                    </label>
                    <label id="oai-mode-apikey-label" style="display: flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 100px; cursor: pointer; border: 2px solid ${currentMode === 'apikey' ? '#a855f7' : '#444'}; background: ${currentMode === 'apikey' ? '#280d3d' : '#2a2a2a'}; color: ${currentMode === 'apikey' ? '#c084fc' : '#888'}; font-size: 15px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <input type="radio" name="openaiAuthMode" id="oai-mode-apikey" value="apikey" ${currentMode === 'apikey' ? 'checked' : ''} style="margin: 0;">
                        &#128273; API Key <span style="font-size: 11px; opacity: 0.7;">(Direct)</span>
                    </label>
                </div>

                <!-- ===== CHATGPT SIGN-IN PANEL ===== -->
                <div id="oai-chatgpt-panel" style="display: ${currentMode === 'chatgpt' ? 'block' : 'none'};">

                    <!-- Account status card -->
                    <div id="oai-account-card" style="border-radius: 12px; border: 1px solid #2a2a2a; background: #0d1117; padding: 16px 18px; margin-bottom: 14px;">
                        <!-- Status row -->
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div id="oai-account-dot" style="width: 9px; height: 9px; border-radius: 50%; background: #555; flex-shrink: 0; box-shadow: 0 0 0 2px #1a1a1a;"></div>
                                <div>
                                    <div id="oai-account-status" style="color: #aaa; font-size: 13px; font-weight: 600; letter-spacing: 0.01em;">Checking&hellip;</div>
                                    <div id="oai-account-sub" style="color: #555; font-size: 11px; margin-top: 2px;"></div>
                                </div>
                            </div>
                            <button id="oai-logout-btn" style="
                                padding: 6px 12px; border-radius: 6px; border: 1px solid #333;
                                background: transparent; color: #666; cursor: pointer; font-size: 12px;
                                display: none; transition: all 0.15s; letter-spacing: 0.02em;">
                                Sign Out
                            </button>
                        </div>

                        <!-- Official Sign in with ChatGPT image button -->
                        <button id="oai-login-btn" style="
                            display: flex; align-items: center; justify-content: center;
                            width: 100%; padding: 0;
                            border-radius: 100px;
                            border: 1.5px solid #d1d5db;
                            background: #ffffff;
                            cursor: pointer;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
                            transition: all 0.15s ease;
                            user-select: none;
                            overflow: hidden;">
                            <img id="oai-login-btn-text" src="data:image/png;base64,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" alt="Sign in with ChatGPT" style="height:48px;width:auto;display:block;pointer-events:none;">
                        </button>

                        <!-- Proxy info (shown when signed in) -->
                        <div id="oai-proxy-info" style="display: none; margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: #0f1923; border: 1px solid #1e3a5f;">
                            <div style="color: #60a5fa; font-size: 11px; font-weight: 600; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.05em;">Proxy Endpoint</div>
                            <div style="color: #93c5fd; font-size: 12px; font-family: 'Courier New', monospace;">http://127.0.0.1:10531/v1</div>
                        </div>
                    </div>

                    <!-- Extension install notice -->
                    <div id="oai-ext-notice" style="display: none; padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(245,158,11,0.25); background: rgba(20,16,0,0.6); margin-bottom: 12px; backdrop-filter: blur(4px);">
                        <div style="color: #f59e0b; font-size: 12px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 5px;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                            Chrome Extension Required
                        </div>
                        <div style="color: #9ca3af; font-size: 12px; line-height: 1.7;">
                            The <strong style="color:#e5e7eb;">"Sign in with ChatGPT"</strong> extension intercepts the login callback.<br>
                            <strong style="color:#e5e7eb;">One-time setup:</strong>&nbsp;
                            <a href="https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna" target="_blank" style="color:#60a5fa; text-decoration: underline;">Install from Chrome Web Store &rarr;</a><br>
                            Then come back and click <strong style="color:#e5e7eb;">Sign in with ChatGPT</strong>.
                        </div>
                    </div>

                    <!-- ChatGPT model search + select -->
                    <div style="margin-bottom: 4px;">
                        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                            <input type="text" id="openaiModelSearch" placeholder="Search models (e.g., gpt-5, mini, nano)" style="flex: 1; padding: 8px; border: 1px solid #444; border-radius: 6px; background: #2d2d2d; color: #fff; font-size: 15px; box-sizing: border-box;">
                            <button id="openaiRefreshModels" title="Refresh models" style="padding: 8px 12px; border: 1px solid #444; border-radius: 6px; background: #3d3d3d; color: #fff; cursor: pointer; font-size: 15px;">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                            </button>
                        </div>
                        <select id="openaiModel" style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 6px; background: #000; color: #fff; font-size: 15px; box-sizing: border-box; font-family: 'VT323', monospace;">
                            <option value="gpt-5.4-mini">Loading models&hellip;</option>
                        </select>
                        <div id="openaiModelStatus" style="color: #666; font-size: 12px; margin-top: 4px;"></div>
                    </div>
                </div>

                <!-- ===== API KEY PANEL ===== -->
                <div id="oai-apikey-panel" style="display: ${currentMode === 'apikey' ? 'block' : 'none'};">
                    <div style="margin-bottom: 8px;">
                        <label style="color: #aaa; font-size: 14px; display: block; margin-bottom: 4px;">OpenAI API Key</label>
                        <input type="password" id="openaiApiKeyInput" value="${currentApiKey}" placeholder="sk-..." style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 6px; background: #1a1a1a; color: #fff; font-size: 15px; box-sizing: border-box;">
                    </div>
                    <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                        <input type="text" id="openaiModelSearchApikey" placeholder="Search models (e.g., gpt-4, o1, turbo)" style="flex: 1; padding: 8px; border: 1px solid #444; border-radius: 6px; background: #2d2d2d; color: #fff; font-size: 15px; box-sizing: border-box;">
                        <button id="openaiRefreshModelsApikey" title="Refresh models" style="padding: 8px 12px; border: 1px solid #444; border-radius: 6px; background: #3d3d3d; color: #fff; cursor: pointer; font-size: 15px;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                        </button>
                    </div>
                    <select id="openaiModelApikey" style="width: 100%; padding: 8px; border: 1px solid #444; border-radius: 6px; background: #000; color: #fff; font-size: 15px; box-sizing: border-box; font-family: 'VT323', monospace;">
                        <option value="gpt-4o-mini">Loading models&hellip;</option>
                    </select>
                    <div id="openaiModelStatusApikey" style="color: #666; font-size: 12px; margin-top: 4px;"></div>
                </div>
            `;

            setTimeout(() => {
                // ---- element refs ----
                const modeChatGPT = document.getElementById('oai-mode-chatgpt');
                const modeApiKey = document.getElementById('oai-mode-apikey');
                const chatgptPanel = document.getElementById('oai-chatgpt-panel');
                const apikeyPanel = document.getElementById('oai-apikey-panel');
                const labelChatGPT = document.getElementById('oai-mode-chatgpt-label');
                const labelApikey = document.getElementById('oai-mode-apikey-label');

                const accountDot = document.getElementById('oai-account-dot');
                const accountStatus = document.getElementById('oai-account-status');
                const accountSub = document.getElementById('oai-account-sub');
                const loginBtn = document.getElementById('oai-login-btn');
                const loginBtnText = document.getElementById('oai-login-btn-text');
                const logoutBtn = document.getElementById('oai-logout-btn');
                const extNotice = document.getElementById('oai-ext-notice');
                const proxyInfo = document.getElementById('oai-proxy-info');

                const modelSelect = document.getElementById('openaiModel');
                const modelSearch = document.getElementById('openaiModelSearch');
                const refreshBtn = document.getElementById('openaiRefreshModels');
                const modelStatus = document.getElementById('openaiModelStatus');

                const apiKeyInput = document.getElementById('openaiApiKeyInput');
                const modelSelectApikey = document.getElementById('openaiModelApikey');
                const modelSearchApikey = document.getElementById('openaiModelSearchApikey');
                const refreshBtnApikey = document.getElementById('openaiRefreshModelsApikey');
                const modelStatusApikey = document.getElementById('openaiModelStatusApikey');

                let allModelsChatGPT = [];
                let allModelsApikey = [];

                // ---- helpers ----
                const populateModelSelect = (select, models, currentValue, statusEl) => {
                    if (!select) return;
                    const val = currentValue || SETTINGS.openaiModel;
                    select.innerHTML = '';
                    const categoryOrder = ['GPT-5 (Codex)', 'GPT-4o', 'Reasoning (o-series)', 'GPT-4', 'GPT-3.5', 'Legacy', 'Other'];
                    const groups = OpenAIProvider.groupModels(models);
                    for (const cat of categoryOrder) {
                        const catModels = groups[cat];
                        if (!catModels || catModels.length === 0) continue;
                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${cat} (${catModels.length})`;
                        catModels.forEach(m => {
                            const opt = document.createElement('option');
                            opt.value = m.id;
                            opt.textContent = m.name;
                            opt.selected = m.id === val;
                            optgroup.appendChild(opt);
                        });
                        select.appendChild(optgroup);
                    }
                    if (statusEl) statusEl.textContent = `${models.length} models available`;
                };

                const applyMode = (mode) => {
                    if (chatgptPanel) chatgptPanel.style.display = mode === 'chatgpt' ? 'block' : 'none';
                    if (apikeyPanel) apikeyPanel.style.display = mode === 'apikey' ? 'block' : 'none';
                    if (labelChatGPT) {
                        labelChatGPT.style.borderColor = mode === 'chatgpt' ? '#22c55e' : '#444';
                        labelChatGPT.style.background = mode === 'chatgpt' ? '#0f2a0f' : '#2a2a2a';
                        labelChatGPT.style.color = mode === 'chatgpt' ? '#22c55e' : '#888';
                    }
                    if (labelApikey) {
                        labelApikey.style.borderColor = mode === 'apikey' ? '#a855f7' : '#444';
                        labelApikey.style.background = mode === 'apikey' ? '#280d3d' : '#2a2a2a';
                        labelApikey.style.color = mode === 'apikey' ? '#c084fc' : '#888';
                    }
                };

                // ---- account status ----
                const refreshAccountStatus = async () => {
                    if (!accountStatus) return;
                    const signedIn = OAuthLogin.isSignedIn();
                    if (signedIn) {
                        accountDot.style.background = '#22c55e';
                        accountDot.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.2)';
                        accountStatus.style.color = '#22c55e';
                        accountStatus.textContent = '✅ Signed in with ChatGPT';
                        accountSub.textContent = 'Connected via openai-oauth proxy — ready to use!';
                        if (loginBtn) loginBtn.style.display = 'none';
                        if (logoutBtn) logoutBtn.style.display = 'block';
                        if (extNotice) extNotice.style.display = 'none';
                        if (proxyInfo) proxyInfo.style.display = 'block';
                    } else {
                        accountDot.style.background = '#555';
                        accountDot.style.boxShadow = '0 0 0 2px #1a1a1a';
                        accountStatus.style.color = '#6b7280';
                        accountStatus.textContent = 'Not signed in';
                        accountSub.textContent = 'Run npx openai-oauth login, then click sign in below';
                        if (loginBtn) loginBtn.style.display = 'flex';
                        if (logoutBtn) logoutBtn.style.display = 'none';
                        if (proxyInfo) proxyInfo.style.display = 'none';
                        const extInstalled = await OAuthLogin.isExtensionInstalled();
                        if (extNotice) extNotice.style.display = extInstalled ? 'none' : 'block';
                    }
                };

                // ---- login button hover effects + click ----
                if (loginBtn) {
                    loginBtn.addEventListener('mouseenter', () => {
                        if (!loginBtn.disabled) {
                            loginBtn.style.background = '#f3f4f6';
                            loginBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15), 0 6px 24px rgba(0,0,0,0.08)';
                            loginBtn.style.transform = 'translateY(-1px)';
                        }
                    });
                    loginBtn.addEventListener('mouseleave', () => {
                        if (!loginBtn.disabled) {
                            loginBtn.style.background = '#ffffff';
                            loginBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)';
                            loginBtn.style.transform = 'translateY(0)';
                        }
                    });
                    loginBtn.addEventListener('mousedown', () => {
                        loginBtn.style.transform = 'translateY(0) scale(0.98)';
                        loginBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                    });
                    loginBtn.addEventListener('click', async () => {
                        loginBtn.disabled = true;
                        loginBtn.style.opacity = '0.7';
                        loginBtn.style.cursor = 'wait';
                        if (loginBtnText) loginBtnText.textContent = 'Opening login…';
                        try {
                            const result = await OAuthLogin.initiateLogin();
                            if (result.status === 'needs-extension') {
                                if (extNotice) extNotice.style.display = 'block';
                                if (loginBtnText) loginBtnText.textContent = 'Install extension first';
                                window.open(result.installUrl, '_blank');
                                loginBtn.disabled = false;
                                loginBtn.style.opacity = '1';
                                loginBtn.style.cursor = 'pointer';
                                if (loginBtnText) setTimeout(() => { loginBtnText.textContent = 'Sign in with ChatGPT'; }, 3000);

                            } else if (result.status === 'started' && result.popup) {
                                // Popup opened — poll until it closes (extension redirects popup to our page)
                                if (loginBtnText) loginBtnText.textContent = 'Waiting for login…';
                                const pollTimer = setInterval(async () => {
                                    const done = OAuthLogin.isSignedIn();
                                    if (done || (result.popup && result.popup.closed)) {
                                        clearInterval(pollTimer);
                                        loginBtn.disabled = false;
                                        loginBtn.style.opacity = '1';
                                        loginBtn.style.cursor = 'pointer';
                                        if (loginBtnText) loginBtnText.textContent = 'Sign in with ChatGPT';
                                        await refreshAccountStatus();
                                        if (OAuthLogin.isSignedIn()) loadChatGPTModels(true);
                                    }
                                }, 800);
                                // Safety timeout — stop polling after 3 minutes
                                setTimeout(() => clearInterval(pollTimer), 3 * 60 * 1000);

                            } else {
                                // Popup was blocked → same-tab redirect already happened
                                if (loginBtnText) loginBtnText.textContent = 'Redirecting…';
                            }
                        } catch (e) {
                            console.error('[OAuthLogin] Login error:', e);
                            if (loginBtnText) loginBtnText.textContent = 'Error — try again';
                            loginBtn.disabled = false;
                            loginBtn.style.opacity = '1';
                            loginBtn.style.cursor = 'pointer';
                            setTimeout(() => { if (loginBtnText) loginBtnText.textContent = 'Sign in with ChatGPT'; }, 3000);
                        }
                    });
                }

                // ---- logout button ----
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', () => {
                        OAuthLogin.logout();
                        refreshAccountStatus();
                        loadChatGPTModels(true);
                    });
                }

                // ---- mode switching ----
                if (modeChatGPT) modeChatGPT.addEventListener('change', () => {
                    SETTINGS.openaiAuthMode = 'chatgpt';
                    saveSettings(SETTINGS);
                    applyMode('chatgpt');
                    refreshAccountStatus();
                    loadChatGPTModels();
                });
                if (modeApiKey) modeApiKey.addEventListener('change', () => {
                    SETTINGS.openaiAuthMode = 'apikey';
                    saveSettings(SETTINGS);
                    applyMode('apikey');
                    loadApiKeyModels();
                });

                // ---- ChatGPT model loading ----
                const loadChatGPTModels = async (forceRefresh = false) => {
                    if (modelStatus) modelStatus.textContent = 'Loading modelsâ€¦';
                    if (refreshBtn) refreshBtn.disabled = true;
                    try {
                        allModelsChatGPT = await OpenAIProvider.fetchModels(forceRefresh);
                        populateModelSelect(modelSelect, allModelsChatGPT, SETTINGS.openaiModel, modelStatus);
                    } catch (e) {
                        if (modelStatus) modelStatus.textContent = `Error: ${e.message}`;
                    } finally {
                        if (refreshBtn) refreshBtn.disabled = false;
                    }
                };

                if (refreshBtn) refreshBtn.addEventListener('click', () => loadChatGPTModels(true));
                if (modelSearch) {
                    let t;
                    modelSearch.addEventListener('input', () => {
                        clearTimeout(t);
                        t = setTimeout(() => {
                            const filtered = OpenAIProvider.filterModels(allModelsChatGPT, modelSearch.value.trim());
                            populateModelSelect(modelSelect, filtered, SETTINGS.openaiModel, modelStatus);
                        }, 150);
                    });
                }
                if (modelSelect) modelSelect.addEventListener('change', () => { SETTINGS.openaiModel = modelSelect.value; saveSettings(SETTINGS); });

                // ---- API Key model loading ----
                const loadApiKeyModels = async (forceRefresh = false) => {
                    if (modelStatusApikey) modelStatusApikey.textContent = 'Loading modelsâ€¦';
                    if (refreshBtnApikey) refreshBtnApikey.disabled = true;
                    try {
                        allModelsApikey = await OpenAIProvider.fetchModels(forceRefresh);
                        populateModelSelect(modelSelectApikey, allModelsApikey, SETTINGS.openaiModel, modelStatusApikey);
                    } catch (e) {
                        if (modelStatusApikey) modelStatusApikey.textContent = `Error: ${e.message}`;
                    } finally {
                        if (refreshBtnApikey) refreshBtnApikey.disabled = false;
                    }
                };

                if (refreshBtnApikey) refreshBtnApikey.addEventListener('click', () => loadApiKeyModels(true));
                if (modelSearchApikey) {
                    let t;
                    modelSearchApikey.addEventListener('input', () => {
                        clearTimeout(t);
                        t = setTimeout(() => {
                            const filtered = OpenAIProvider.filterModels(allModelsApikey, modelSearchApikey.value.trim());
                            populateModelSelect(modelSelectApikey, filtered, SETTINGS.openaiModel, modelStatusApikey);
                        }, 150);
                    });
                }
                if (modelSelectApikey) modelSelectApikey.addEventListener('change', () => { SETTINGS.openaiModel = modelSelectApikey.value; saveSettings(SETTINGS); });
                if (apiKeyInput) {
                    let saveTimeout;
                    apiKeyInput.addEventListener('input', () => {
                        clearTimeout(saveTimeout);
                        saveTimeout = setTimeout(() => { SETTINGS.openaiApiKey = apiKeyInput.value; saveSettings(SETTINGS); }, 500);
                    });
                }

                // ---- initial load ----
                const mode = currentMode || 'chatgpt';
                applyMode(mode);
                if (mode === 'chatgpt') {
                    refreshAccountStatus();
                    loadChatGPTModels();
                } else {
                    loadApiKeyModels();
                }
            }, 100);

            return wrapper;
        };


        panelContent.appendChild(createOpenAISettings());
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

        // ========== NVIDIA NIM API KEY + MODEL SELECTOR ==========
        panelContent.appendChild(createTextInput('nvidiaApiKey', 'NVIDIA NIM API Key', SETTINGS.nvidiaApiKey, 'nvapi-... (free key from build.nvidia.com)'));

        const createNvidiaModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'nvidia-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'nvidia' ? 'block' : 'none'};`;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">NVIDIA NIM Model</div>
                <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                    <input type="text" id="nvidiaModelSearch" placeholder="Search models (e.g., nemotron, deepseek, kimi)" style="
                        flex: 1;
                        padding: 8px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #2d2d2d;
                        color: #fff;
                        font-size: 15px;
                        box-sizing: border-box;
                    ">
                    <button id="nvidiaRefreshModels" title="Refresh models from API" style="
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        background: #3d3d3d;
                        color: #fff;
                        cursor: pointer;
                        font-size: 15px;
                    "><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                </div>
                <select id="nvidiaModel" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #76b900;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                    <option value="z-ai/glm-5.2">Loading models...</option>
                </select>
                <div id="nvidiaModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;"></div>
            `;

            setTimeout(() => {
                const select = document.getElementById('nvidiaModel');
                const searchInput = document.getElementById('nvidiaModelSearch');
                const refreshBtn = document.getElementById('nvidiaRefreshModels');
                const statusDiv = document.getElementById('nvidiaModelStatus');

                let allModels = [];

                const populateSelect = (models) => {
                    if (!select) return;
                    const currentValue = SETTINGS.nvidiaModel || NvidiaProvider.CONFIG.DEFAULT_MODEL;
                    select.innerHTML = '';

                    const groups = NvidiaProvider.groupModels(models);
                    const groupOrder = ['NVIDIA', 'Z.ai', 'DeepSeek', 'Google', 'Mistral', 'Moonshot', 'MiniMax', 'Qwen', 'StepFun', 'Other'];
                    const renderedGroups = new Set();

                    // Render in priority order first, then remaining
                    [...groupOrder, ...Object.keys(groups).filter(g => !groupOrder.includes(g))].forEach(g => {
                        if (renderedGroups.has(g) || !groups[g] || groups[g].length === 0) return;
                        renderedGroups.add(g);
                        const optgroup = document.createElement('optgroup');
                        optgroup.label = `${g} (${groups[g].length})`;
                        groups[g].forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            const tagsStr = model.tags ? ` — ${model.tags}` : '';
                            const ctxStr = model.context ? ` [${model.context}]` : '';
                            option.textContent = `${model.name} (Free)${ctxStr}${tagsStr}`;
                            option.selected = model.id === currentValue;
                            optgroup.appendChild(option);
                        });
                        select.appendChild(optgroup);
                    });

                    if (statusDiv) statusDiv.textContent = `${models.length} models available`;
                };

                const loadModels = async (forceRefresh = false) => {
                    if (statusDiv) statusDiv.textContent = 'Loading models...';
                    if (refreshBtn) {
                        refreshBtn.disabled = true;
                        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;animation:bypassSpin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
                    }
                    try {
                        allModels = await NvidiaProvider.fetchModels(forceRefresh);
                        populateSelect(allModels);
                        if (statusDiv) statusDiv.textContent = `${allModels.length} models loaded`;
                    } catch (error) {
                        console.error('[NVIDIA] Failed to load models:', error);
                        if (statusDiv) statusDiv.textContent = `Error: ${error.message}`;
                        if (select) select.innerHTML = '<option value="z-ai/glm-5.2" selected>GLM-5.2 (Default)</option>';
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
                            const filtered = NvidiaProvider.filterModels(allModels, searchInput.value.trim());
                            populateSelect(filtered);
                        }, 150);
                    });
                }

                if (refreshBtn) {
                    refreshBtn.addEventListener('click', () => loadModels(true));
                }

                if (select) {
                    select.addEventListener('change', () => {
                        SETTINGS.nvidiaModel = select.value;
                        saveSettings(SETTINGS);
                    });
                }

                loadModels();
            }, 100);

            return wrapper;
        };
        panelContent.appendChild(createNvidiaModelSelector());
        // =========================================================

        // ========== OMNIROUTE API KEY + MODEL SELECTOR ==========
        panelContent.appendChild(createTextInput('omnirouteApiKey', 'OmniRoute API Key', SETTINGS.omnirouteApiKey, 'OMNIROUTE_API_KEY (or leave empty for keyless local gateway)'));
        panelContent.appendChild(createTextInput('omnirouteBaseUrl', 'OmniRoute Base URL', SETTINGS.omnirouteBaseUrl, 'Default: http://localhost:20128/v1'));

        const createOmniRouteModelSelector = () => {
            const wrapper = document.createElement('div');
            wrapper.id = 'omniroute-model-wrapper';
            wrapper.style.cssText = `padding: 10px 0; border-bottom: 1px solid #333; display: ${SETTINGS.aiProvider === 'omniroute' ? 'block' : 'none'};`;

            // Models from opencode.json omniroute provider
            const omnirouteModels = [
                { id: 'cl/nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B (Default)' },
                { id: 'oc/big-pickle', name: 'Big Pickle (OpenCode Free) · Free' },
                { id: 'oc/deepseek-v4-flash-free', name: 'DeepSeek V4 Flash Free (OpenCode Free) · Free' },
                { id: 'agy/claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Antigravity) · Free' },
                { id: 'agy/claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking (Antigravity) · Free' },
                { id: 'agy/gemini-3.1-pro-high', name: 'Gemini 3.1 Pro High (Antigravity) · Free' },
                { id: 'kr/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (Kiro) · Free' },
                { id: 'kr/claude-haiku-4.5', name: 'Claude Haiku 4.5 (Kiro) · Free' },
                { id: 'kr/deepseek-3.2', name: 'DeepSeek V3.2 (Kiro) · Free' },
                { id: 'kr/minimax-m2.5', name: 'MiniMax M2.5 (Kiro) · Free' },
                { id: 'kr/glm-5', name: 'GLM 5 (Kiro) · Free' },
                { id: 'kr/qwen3-coder-next', name: 'Qwen 3 Coder Next (Kiro) · Free' },
            ];

            const currentValue = SETTINGS.omnirouteModel || OmniRouteProvider.CONFIG.DEFAULT_MODEL;

            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 17px; margin-bottom: 6px;">OmniRoute Model</div>
                <input type="text" id="omnirouteModel" list="omnirouteModels" placeholder="Type to search models (e.g., claude, deepseek, qwen, gemini, nemotron)" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #000000;
                    color: #2196F3;
                    font-size: 15px;
                    box-sizing: border-box;
                    font-family: 'VT323', monospace;
                ">
                <datalist id="omnirouteModels"></datalist>
                <div id="omnirouteModelStatus" style="color: #666; font-size: 14px; margin-top: 4px;">${omnirouteModels.length} models available from opencode config</div>
            `;

            setTimeout(() => {
                const input = document.getElementById('omnirouteModel');
                const datalist = document.getElementById('omnirouteModels');
                const statusDiv = document.getElementById('omnirouteModelStatus');

                // Populate datalist with models from opencode.json
                omnirouteModels.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.label = model.name;
                    datalist.appendChild(option);
                });

                // Set current value
                input.value = currentValue;

                // Save on change
                if (input) {
                    input.addEventListener('change', () => {
                        SETTINGS.omnirouteModel = input.value;
                        saveSettings(SETTINGS);
                    });
                    input.addEventListener('blur', () => {
                        // Also save on blur in case user types a custom model ID
                        SETTINGS.omnirouteModel = input.value;
                        saveSettings(SETTINGS);
                    });
                }
            }, 50);

            return wrapper;
        };
        panelContent.appendChild(createOmniRouteModelSelector());
        // =========================================================

        const note = document.createElement('div');
        note.style.cssText = 'color:#3f3f46;font-size:14px;padding:14px 4px;text-align:center;font-family:"VT323",monospace;line-height:1.7;border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;';
        note.innerHTML = 'Reload page after changing settings<br>Keys: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#4CAF50;">Gemini</a> | <a href="https://openrouter.ai/keys" target="_blank" style="color:#4CAF50;">OpenRouter</a> | <a href="https://g4f.space" target="_blank" style="color:#4CAF50;">G4F</a><br>Puter.js: no API key required | <a href="https://developer.puter.com/ai/" target="_blank" style="color:#2196F3;">Puter AI docs</a><br>DuckDuckGo AI is FREE! | <a href="https://github.com/cloudWaddie/yuppbridge" target="_blank" style="color:#2196F3;">YuppBridge</a><br>NVIDIA NIM: Free key at <a href="https://build.nvidia.com" target="_blank" style="color:#76b900;">build.nvidia.com</a><br>OmniRoute: Self-hosted gateway at <a href="http://localhost:20128" target="_blank" style="color:#2196F3;">localhost:20128</a> | <a href="https://github.com/omnigate/omniroute" target="_blank" style="color:#2196F3;">OmniRoute GitHub</a>';
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

    // 1. ISOLATED TAB SANDBOX & ANTI-PROCTORING FIREWALL
    if (SETTINGS.bypassTabDetection) {
        console.log('[KillCode Sandbox] Activating Isolated Tab Sandbox Firewall...');

        // ── 1a. Trap Page Visibility API (Always VISIBLE) ──────────────────────
        try {
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true
            });
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true
            });
            Object.defineProperty(document, 'webkitVisibilityState', {
                get: () => 'visible',
                configurable: true
            });
            Object.defineProperty(document, 'webkitHidden', {
                get: () => false,
                configurable: true
            });
        } catch (e) {}

        // ── 1b. Trap Window Focus API (Always FOCUSED) ─────────────────────────
        try {
            Object.defineProperty(document, 'hasFocus', {
                value: () => true,
                writable: true,
                configurable: true
            });
            Object.defineProperty(window, 'hasFocus', {
                value: () => true,
                writable: true,
                configurable: true
            });
        } catch (e) {}

        // ── 1c. Block window/document level event handlers ──────────────────────
        const nullifyProperties = ['onblur', 'onfocus', 'onmouseleave', 'onmouseout', 'onvisibilitychange', 'onpagehide'];
        nullifyProperties.forEach(prop => {
            try {
                window[prop] = null;
                document[prop] = null;
                Object.defineProperty(window, prop, {
                    get: () => null,
                    set: (fn) => console.log(`[KillCode Sandbox] Blocked ${prop} assignment`),
                    configurable: true
                });
                Object.defineProperty(document, prop, {
                    get: () => null,
                    set: (fn) => console.log(`[KillCode Sandbox] Blocked document.${prop} assignment`),
                    configurable: true
                });
            } catch (e) {}
        });

        // ── 1d. Block Proctoring Event Listeners (Tab Switch, Blur, Mouse Leave) ──
        const ISOLATED_BLOCKED_EVENTS = new Set([
            'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange',
            'blur', 'focus', 'focusout', 'pagehide', 'freeze',
            'mouseleave', 'mouseout', 'pointerleave', 'dragleave', 'mousewheel'
        ]);

        EventTarget.prototype.addEventListener = function (type, listener, options) {
            const typeLower = String(type).toLowerCase();
            if (ISOLATED_BLOCKED_EVENTS.has(typeLower)) {
                if (this === window || this === document || this === document.body || this === document.documentElement) {
                    console.log(`[KillCode Sandbox] Blocked isolated ${type} listener on ${this.constructor.name}`);
                }
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        // ── 1e. Block beforeunload / unload logout popups ──────────────────────
        window.addEventListener('beforeunload', (e) => {
            e.stopImmediatePropagation();
        }, true);

        // ── 1f. Suppress native alert/confirm popups during tests & assessments ──
        const isTestOrAssessment = location.href.includes('dailytest') ||
                                   location.href.includes('dailychallenge') ||
                                   location.href.includes('mcq') ||
                                   location.href.includes('assessment') ||
                                   location.href.includes('test');
        if (isTestOrAssessment || !SETTINGS.enablePopupMode) {
            window.alert = function (msg) {
                console.log('[Native Alert Suppressed]', msg);
                showToastPill(String(msg), 'info', 2500);
            };
            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow.alert = function (msg) {
                    console.log('[Unsafe Alert Suppressed]', msg);
                    showToastPill(String(msg), 'info', 2500);
                };
            }
        }
    }

    // ========== KEYBOARD SHORTCUT: Press 'Q' to toggle Human Typing Speed Mode ==========
    window.addEventListener('keydown', (e) => {
        if (e.key && e.key.toLowerCase() === 'q') {
            const active = document.activeElement;
            const tag = (active?.tagName || '').toUpperCase();
            const isEditable = active?.isContentEditable ||
                               tag === 'INPUT' ||
                               tag === 'TEXTAREA' ||
                               active?.classList?.contains('ace_text-input');

            // If user is NOT actively typing in an input field, toggle Human Typing Speed Mode
            if (!isEditable && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                SETTINGS.humanTypingMode = !SETTINGS.humanTypingMode;
                saveSettings();
                showToastPill(
                    `Human Typing Speed: ${SETTINGS.humanTypingMode ? 'ON (Natural Typing)' : 'OFF (Instant Insert)'}`,
                    SETTINGS.humanTypingMode ? 'success' : 'info',
                    2500
                );
            }
        }
    }, true);
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
        // Block sendBeacon completely for telemetry & proctoring endpoints
        if (navigator.sendBeacon) {
            const _origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url, data) {
                const u = String(url).toLowerCase();
                if (u.includes('logout') || u.includes('tab-switch') || u.includes('tab') ||
                    u.includes('blur') || u.includes('focus') || u.includes('proctoring') ||
                    u.includes('heartbeat') || u.includes('telemetry') || u.includes('activity') ||
                    u.includes('log') || u.includes('event') || u.includes('monitor')) {
                    console.log(`[KillCode Firewall] Blocked sendBeacon telemetry ping to: ${url}`);
                    return true; // Fake successful transmission
                }
                return _origBeacon(url, data);
            };
        }

        // Override XMLHttpRequest and fetch to monitor and drop tracking pings
        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = String(url || '');
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            const u = (this._url || '').toLowerCase();
            if (u.includes('/heartbeat') ||
                u.includes('/telemetry') ||
                u.includes('/proctoring') ||
                u.includes('/activity') ||
                u.includes('/tab-switch') ||
                u.includes('/tab') ||
                u.includes('/blur') ||
                u.includes('/focus') ||
                u.includes('/eventlog') ||
                u.includes('/logactivity')) {
                console.log('[KillCode Firewall] Blocked XHR telemetry to:', this._url);
                this.readyState = 4;
                this.status = 200;
                this.statusText = 'OK';
                if (typeof this.onreadystatechange === 'function') {
                    this.onreadystatechange();
                }
                return;
            }
            return originalXHRSend.apply(this, arguments);
        };

        window.fetch = function (resource, init) {
            const urlStr = String(resource?.url || resource || '').toLowerCase();
            if (urlStr.includes('/heartbeat') ||
                urlStr.includes('/telemetry') ||
                urlStr.includes('/proctoring') ||
                urlStr.includes('/activity') ||
                urlStr.includes('/tab-switch') ||
                urlStr.includes('/tab') ||
                urlStr.includes('/blur') ||
                urlStr.includes('/focus') ||
                urlStr.includes('/eventlog') ||
                urlStr.includes('/logactivity')) {
                console.log('[KillCode Firewall] Blocked fetch telemetry to:', urlStr);
                return Promise.resolve(new Response(JSON.stringify({ success: true, status: 'ok' }), {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            return originalFetch.apply(this, arguments);
        };
    } // End of SETTINGS.blockTelemetry

    // 6. SILENT SESSION KEEP-ALIVE (PREVENT SESSION EXPIRATION)
    // Sends a background HEAD request every 2.5 minutes to refresh session cookies.
    // Prevents backend session timeout while leaving proctoring system blind.
    const startSessionKeepAlive = () => {
        setInterval(() => {
            try {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'HEAD',
                        url: location.href,
                        onload: () => console.log('[KillCode Sandbox] Session refreshed silently.'),
                        onerror: () => {}
                    });
                } else if (originalFetch) {
                    originalFetch(location.href, { method: 'HEAD', cache: 'no-store' })
                        .then(() => console.log('[KillCode Sandbox] Session refreshed silently.'))
                        .catch(() => {});
                }
            } catch (e) {}
        }, 150000); // 2.5 minutes
    };
    startSessionKeepAlive();

    // 7. ENSURE PERMANENT PROCTORING ISOLATION
    setTimeout(() => {
        if (SETTINGS.bypassTabDetection) {
            const ISOLATED_BLOCKED_EVENTS_PERMANENT = new Set([
                'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange',
                'blur', 'focus', 'focusout', 'pagehide', 'freeze',
                'mouseleave', 'mouseout', 'pointerleave', 'dragleave', 'mousewheel'
            ]);

            EventTarget.prototype.addEventListener = function (type, listener, options) {
                const typeLower = String(type).toLowerCase();
                if (ISOLATED_BLOCKED_EVENTS_PERMANENT.has(typeLower)) {
                    if (this === window || this === document || this === document.body || this === document.documentElement) {
                        console.log(`[KillCode Sandbox] Blocked isolated ${type} listener (post-init)`);
                        return;
                    }
                }
                return originalAddEventListener.call(this, type, listener, options);
            };

            window.onblur = null;
            window.onfocus = null;
            document.onblur = null;
            document.onfocus = null;
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
    let captchaRunInProgress = false;
    let captchaPageObserver = null;

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

    async function runCaptchaSolver() {
        if (captchaRunInProgress) return;
        captchaRunInProgress = true;
        try {
            await handleCaptcha();
        } finally {
            captchaRunInProgress = false;
        }
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

        runCaptchaSolver();
    }

    // Initialize captcha solver only if script is enabled
    onScriptEnabled(() => {
        const startCaptchaSolver = () => {
            initCaptchaSolver();

            if (captchaPageObserver || !document.body) return;
            captchaPageObserver = new MutationObserver(() => {
                const textbox = document.getElementById(CAPTCHA_INPUT_ID);
                if (hasCaptchaElements() && textbox && !textbox.value) {
                    runCaptchaSolver();
                }
            });
            captchaPageObserver.observe(document.body, { childList: true, subtree: true });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startCaptchaSolver, { once: true });
        } else {
            setTimeout(startCaptchaSolver, 100);
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
                    runCaptchaSolver();
                }
            }, 500);
        });

        console.log('Anti-cheat bypass script v5.0 loaded successfully');
        console.log('Settings:', SETTINGS);
    });

    // ============================================
    // 10. AI SOLUTION GENERATOR
    // Uses Gemini, OpenAI, OpenRouter, Puter.js, G4F, DuckDuckGo, YuppBridge, Nvidia, or OmniRoute
    // Powered by Grandmaster Competitive Programming Prompts for SkillRack
    // ============================================

    const parseLanguageString = (rawText) => {
        if (!rawText || typeof rawText !== 'string') return null;
        const s = rawText.trim();
        const upper = s.toUpperCase();

        if (upper.includes('SQL') || upper.includes('MYSQL') || upper.includes('ORACLE') || upper.includes('POSTGRES')) return 'SQL';
        if (upper.includes('JAVA') && !upper.includes('SCRIPT')) return 'Java';
        if (upper.includes('PYTHON') || upper.includes('PY3') || /\bPY\b/i.test(s) || upper.includes('CPYTHON')) return 'Python';
        if (upper.includes('C++') || upper.includes('CPP') || upper.includes('G++') || upper.includes('CLANG++')) {
            if (upper.includes('23')) return 'C++23';
            if (upper.includes('20')) return 'C++20';
            if (upper.includes('17')) return 'C++17';
            return 'C++';
        }
        if (upper.includes('C#') || upper.includes('CSHARP')) return 'C#';
        if (upper.includes('JAVASCRIPT') || upper.includes('NODE') || /\bJS\b/i.test(s)) return 'JavaScript';
        if (upper.includes('GOLANG') || /\bGO\b/i.test(s)) return 'Go';
        if (upper.includes('RUST')) return 'Rust';
        if (upper.includes('PHP')) return 'PHP';
        if (upper.includes('KOTLIN')) return 'Kotlin';
        if (upper.includes('SWIFT')) return 'Swift';
        if (/^C\b/i.test(s) || upper.includes('GCC') || upper.includes('CLANG') || upper.includes('ANSI C') || upper === 'C' || upper.startsWith('C(') || upper.startsWith('C ')) return 'C';
        return null;
    };

    const isLanguageMismatch = (code, language) => {
        if (!code) return false;
        const langLower = String(language || '').toLowerCase().trim();
        const trimmed = code.trim();

        // Target is C / C++ / Java / SQL, but code is clearly Python
        if (langLower === 'c' || langLower === 'c++' || langLower === 'cpp' || langLower === 'java' || langLower === 'sql') {
            if (/^\s*(import\s+sys|import\s+os|from\s+collections|tokens\s*=\s*sys\.stdin|def\s+[a-zA-Z0-9_]+\s*\(|print\s*\()/m.test(trimmed) &&
                !/^\s*(#include|import\s+java|public\s+class|SELECT)/m.test(trimmed)) {
                return true;
            }
        }
        // Target is Python, but code is clearly C/C++
        if (langLower === 'python' || langLower === 'python3' || langLower === 'py') {
            if (/^\s*(#include\s*<|using\s+namespace\s+std|int\s+main\s*\(|void\s+main\s*\()/m.test(trimmed)) {
                return true;
            }
        }
        return false;
    };

    const getSelectedLanguage = () => {
        // 1. Compiler error output indicator (Ground truth when judge has failed)
        const errorPanel = document.getElementById('errormsg_content') || document.getElementById('errormsg') || document.querySelector('.ui-messages-error');
        if (errorPanel) {
            const errText = errorPanel.textContent || '';
            if (/Hello\.c:\d+/i.test(errText) || /gcc/i.test(errText)) return 'C';
            if (/Hello\.cpp:\d+/i.test(errText) || /g\+\+/i.test(errText)) return 'C++';
            if (/Hello\.java:\d+/i.test(errText) || /javac/i.test(errText)) return 'Java';
            if (/Hello\.py:\d+/i.test(errText) || /Traceback/i.test(errText) || /File "[^"]+\.py"/i.test(errText)) return 'Python';
            if (/Hello\.cs:\d+/i.test(errText) || /csc/i.test(errText)) return 'C#';
        }

        // 2. PrimeFaces visible dropdown label (#langs_label)
        const labelEl = document.getElementById('langs_label') || document.querySelector('.ui-selectonemenu-label');
        if (labelEl) {
            const parsed = parseLanguageString(labelEl.textContent || labelEl.innerText);
            if (parsed) return parsed;
        }

        // 3. Hidden <select id="langs_input"> element
        const langSelect = document.getElementById('langs_input') || document.querySelector('select[id*="lang"]');
        if (langSelect && langSelect.selectedIndex >= 0) {
            const opt = langSelect.options[langSelect.selectedIndex];
            const parsed = parseLanguageString(opt?.text || opt?.textContent || opt?.value);
            if (parsed) return parsed;
        }

        // 4. Any dropdown on page with language attributes
        const anySelect = document.querySelectorAll('select, .ui-selectonemenu');
        for (const el of anySelect) {
            const parsed = parseLanguageString(el.textContent || el.value);
            if (parsed) return parsed;
        }

        // 5. Ace Editor syntax mode
        try {
            if (window.txtCode && typeof window.txtCode.getSession === 'function') {
                const modeId = (window.txtCode.getSession().getMode()?.['$id'] || '').toLowerCase();
                if (modeId.includes('sql')) return 'SQL';
                if (modeId.includes('java') && !modeId.includes('javascript')) return 'Java';
                if (modeId.includes('python')) return 'Python';
                if (modeId.includes('c_cpp')) return 'C';
                if (modeId.includes('csharp')) return 'C#';
                if (modeId.includes('javascript')) return 'JavaScript';
                if (modeId.includes('golang') || modeId.includes('go')) return 'Go';
                if (modeId.includes('rust')) return 'Rust';
            }
        } catch (_) { }

        // 6. Pre-code & Page heuristics
        const pageText = (document.body?.innerText || '').toLowerCase();
        if (pageText.includes('select ') && pageText.includes('from ') && (pageText.includes('table') || pageText.includes('database'))) {
            return 'SQL';
        }

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
                    return;
                }

                // Pre block — grab decoded text content as-is
                if (tag === 'PRE') {
                    template += node.textContent;
                    return;
                }

                // Skip script/style subtrees
                if (tag === 'SCRIPT' || tag === 'STYLE') return;

                // Skip settings panel or auto-solver status indicator subtrees
                if (node.id === 'bypass-settings-panel' || node.id === 'auto-solver-status') return;

                for (const child of node.childNodes) {
                    traverse(child);
                }
            } else if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent;
                if (t.trim()) template += t;
            }
        };

        traverse(container);
        return { template: template.trim(), inputs: blankInputs };
    };

    // Helper to format HTML element to structured Markdown/Text preserving pre, tables, and paragraphs
    const elementToStructuredMarkdown = (element) => {
        if (!element) return '';
        const clone = element.cloneNode(true);

        // Remove unwanted UI elements
        const unwantedSelectors = [
            '.ribbon', '.circular', '.image', '#bypass-settings-panel',
            '#auto-solver-status', 'script', 'style', 'button', '.ui-button'
        ];
        unwantedSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        });

        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const tag = node.tagName.toUpperCase();

            // Code and preformatted blocks: preserve EXACT spacing and newlines
            if (tag === 'PRE' || tag === 'CODE') {
                const content = node.textContent.replace(/\r\n/g, '\n');
                return `\n\`\`\`\n${content}\n\`\`\`\n`;
            }

            // Tables: convert to clean markdown table representation
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                let tableText = '\n';
                rows.forEach((tr, rIdx) => {
                    const cells = Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim().replace(/\s+/g, ' '));
                    if (cells.length > 0) {
                        tableText += '| ' + cells.join(' | ') + ' |\n';
                        if (rIdx === 0) {
                            tableText += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
                        }
                    }
                });
                return tableText + '\n';
            }

            // Headers
            if (/^H[1-6]$/.test(tag)) {
                return `\n\n### ${node.textContent.trim()}\n\n`;
            }

            // Bold / strong labels
            if (tag === 'B' || tag === 'STRONG') {
                const txt = node.textContent.trim();
                if (txt.toLowerCase().includes('example') || txt.toLowerCase().includes('input') ||
                    txt.toLowerCase().includes('output') || txt.toLowerCase().includes('boundary') ||
                    txt.toLowerCase().includes('constraint') || txt.toLowerCase().includes('explanation')) {
                    return `\n\n**${txt}**\n`;
                }
                return ` **${txt}** `;
            }

            // List items
            if (tag === 'LI') {
                return `\n- ${Array.from(node.childNodes).map(processNode).join('').trim()}`;
            }

            // Paragraphs and divs
            if (tag === 'P' || tag === 'DIV') {
                const inner = Array.from(node.childNodes).map(processNode).join('').trim();
                return inner ? `\n\n${inner}\n\n` : '';
            }

            // Line breaks
            if (tag === 'BR') {
                return '\n';
            }

            // Default: process child nodes
            return Array.from(node.childNodes).map(processNode).join('');
        };

        let result = processNode(clone);
        // Normalize multiple blank lines (max 2 consecutive newlines)
        result = result.replace(/\n{3,}/g, '\n\n').trim();
        return result;
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
        if (!card && cards.length > 0) {
            card = cards[0];
        }

        if (card) {
            let problemTitle = '';
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

            // For tutor pages, get tutorial hint
            if (isTutorPage) {
                const tutorHighlight = card.querySelector('.tutorhighlight');
                if (tutorHighlight) {
                    tutorialHint = tutorHighlight.textContent.trim();
                }

                const preCodes = document.querySelectorAll('#codeeditorpanel pre, .ui-outputpanel pre');
                preCodes.forEach((pre, index) => {
                    const text = pre.textContent.trim();
                    if (text.length > 5) {
                        if (index === 0 || pre.closest('#j_id_7a, [id*="_7a"]')) {
                            preCode = text;
                        } else if (index === 1 || pre.closest('#j_id_7c, [id*="_7c"]')) {
                            postCode = text;
                        }
                    }
                });

                if (!preCode || !postCode) {
                    const allPres = card.querySelectorAll('pre');
                    if (allPres.length >= 1 && !preCode) preCode = allPres[0].textContent.trim();
                    if (allPres.length >= 2 && !postCode) postCode = allPres[1].textContent.trim();
                }
            }

            // For code track pages, get pre-code and post-code (inline code)
            if (isCodeTrackPage) {
                const codeEditorPanel = document.getElementById('codeeditorpanel');
                if (codeEditorPanel) {
                    const preCodes = codeEditorPanel.querySelectorAll('pre');
                    preCodes.forEach((pre) => {
                        const text = pre.textContent.trim();
                        if (text.length > 5) {
                            if (pre.closest('#j_id_8t, [id*="_8t"]')) {
                                if (!postCode) postCode = text;
                            } else if (pre.closest('#j_id_8n, [id*="_8n"]')) {
                                if (!preCode) preCode = text;
                            } else if (!preCode) {
                                preCode = text;
                            }
                        }
                    });
                }

                if (!preCode || !postCode) {
                    const codeDivPres = document.querySelectorAll('#codediv pre, #codediv .ui-outputpanel pre');
                    const presList = Array.from(codeDivPres);
                    if (presList.length >= 1 && !preCode) preCode = presList[0].textContent.trim();
                    if (presList.length >= 2 && !postCode) postCode = presList[presList.length - 1].textContent.trim();
                }
            }

            // Structured markdown extraction from problem card (preserves table, pre, bold labels, sample I/O)
            const structuredDescription = elementToStructuredMarkdown(card);

            // Build full context for AI
            let fullDescription = structuredDescription;
            if (isTutorPage && tutorialHint) {
                fullDescription = `**Tutorial Hint:**\n${tutorialHint}\n\n${fullDescription}`;
            }

            if (preCode || postCode) {
                if (preCode) {
                    fullDescription += `\n\n### Pre-written Code (Provided by System):\n\`\`\`\n${preCode}\n\`\`\`\n`;
                }
                if (postCode) {
                    fullDescription += `\n\n### Post-written Code (Provided by System):\n\`\`\`\n${postCode}\n\`\`\`\n`;
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
            errorType: null,  // 'hidden_test_failed', 'wrong_output', 'compilation_error', or 'runtime_error'
            input: '',
            expectedOutput: '',
            yourOutput: '',
            compilationError: '',
            currentCode: '',
            passedCount: 0,
            failedCount: 0,
            rawMessage: ''
        };

        // Get current code from editor
        if (window.txtCode && window.txtCode.getSession) {
            errorInfo.currentCode = window.txtCode.getSession().getValue();
        }

        // Check for "Incorrect Captcha" - ignore this
        const growlItems = document.querySelectorAll('.ui-growl-item');
        for (const item of growlItems) {
            if (item.textContent.includes('Incorrect Captcha')) {
                return errorInfo;
            }
        }

        // Check error panel
        const errorPanel = document.getElementById('errormsg');
        const panelContent = document.getElementById('errormsg_content') || errorPanel;
        const panelText = (panelContent ? panelContent.textContent.trim() : '');

        // Also inspect growl messages or error text across page
        let fullErrorText = panelText;
        growlItems.forEach(g => { fullErrorText += '\n' + g.textContent.trim(); });

        if (!fullErrorText.trim()) return errorInfo;

        const panelTextLower = fullErrorText.toLowerCase();

        // Check for Compilation Error
        const compilationIndicators = [
            'error:', 'undefined reference', 'multiple definition',
            'ld returned', 'collect2:', 'fatal error', 'syntax error',
            'expected', 'undeclared', 'implicit declaration'
        ];
        const isCompilationError = compilationIndicators.some(indicator =>
            panelTextLower.includes(indicator.toLowerCase())
        );

        // Check for Runtime Errors
        const runtimeIndicators = [
            'segmentation fault', 'core dumped', 'bus error', 'floating point exception',
            'abort', 'time limit exceeded', 'memory limit', 'stack overflow',
            'runtime error', 'killed', 'signal'
        ];
        const isRuntimeError = runtimeIndicators.some(indicator =>
            panelTextLower.includes(indicator.toLowerCase())
        );

        // Check for Private / Hidden Test Case Failures
        const isHiddenTestFailure = panelTextLower.includes('private') ||
            panelTextLower.includes('hidden') ||
            (panelTextLower.includes('passed') && panelTextLower.includes('failed')) ||
            panelTextLower.includes('did not pass the execution');

        errorInfo.hasError = true;
        errorInfo.rawMessage = fullErrorText;

        // Parse Passed / Failed counts if present (e.g. "9 Passed 3 Failed")
        const passedMatch = fullErrorText.match(/(\d+)\s*Passed/i);
        const failedMatch = fullErrorText.match(/(\d+)\s*Failed/i);
        if (passedMatch) errorInfo.passedCount = parseInt(passedMatch[1], 10);
        if (failedMatch) errorInfo.failedCount = parseInt(failedMatch[1], 10);

        if (isCompilationError) {
            errorInfo.errorType = 'compilation_error';
            const errorDiv = panelContent?.querySelector?.('div[style*="word-wrap"]');
            if (errorDiv) {
                errorInfo.compilationError = errorDiv.textContent.replace(/\s+/g, ' ').trim();
            } else {
                errorInfo.compilationError = panelText || fullErrorText;
            }
        } else if (isRuntimeError) {
            errorInfo.errorType = 'runtime_error';
            const cards = panelContent ? panelContent.querySelectorAll('.ui-card-content') : [];
            const labels = panelContent ? panelContent.querySelectorAll('.ui.label') : [];

            labels.forEach((label, index) => {
                const labelText = label.textContent.toLowerCase();
                const cardContent = cards[index]?.textContent.trim() || '';
                if (labelText.includes('input')) errorInfo.input = cardContent;
                else if (labelText.includes('expected')) errorInfo.expectedOutput = cardContent;
                else if (labelText.includes('your program') || labelText.includes('your output')) errorInfo.yourOutput = cardContent;
            });
        } else if (isHiddenTestFailure && (!errorInfo.input && !errorInfo.expectedOutput)) {
            // Hidden test case failure: no visible sample I/O provided by judge
            errorInfo.errorType = 'hidden_test_failed';
        } else {
            errorInfo.errorType = 'wrong_output';
            const cards = panelContent ? panelContent.querySelectorAll('.ui-card-content') : [];
            const labels = panelContent ? panelContent.querySelectorAll('.ui.label') : [];

            labels.forEach((label, index) => {
                const labelText = label.textContent.toLowerCase();
                const cardContent = cards[index]?.textContent.trim() || '';
                if (labelText.includes('input')) errorInfo.input = cardContent;
                else if (labelText.includes('expected')) errorInfo.expectedOutput = cardContent;
                else if (labelText.includes('your program') || labelText.includes('your output')) errorInfo.yourOutput = cardContent;
            });

            // If inputs are empty despite being marked wrong_output, mark as hidden failure
            if (!errorInfo.input && !errorInfo.expectedOutput && (errorInfo.failedCount > 0 || isHiddenTestFailure)) {
                errorInfo.errorType = 'hidden_test_failed';
            }
        }

        return errorInfo;
    };

    // ==============================================================
    // GRANDMASTER COMPETITIVE PROGRAMMING SYSTEM PROMPTS
    // ==============================================================
    const GRANDMASTER_SYSTEM_PROMPT = `You are an Elite Principal Software Engineer, a Top-Tier Competitive Programmer, and a Technical Architect with deep pathological hidden-test-case intuition. You write flawless, bulletproof, production-grade code that passes EVERY hidden test case on the SkillRack automated judge on the FIRST submission. You think like a compiler, an adversary, and a mathematician all at once.

Your code is directly fed into an automated judge system. Zero preambles, zero concluding explanations, zero comments, zero scaffolding text. Only the exact, complete, runnable program. Maximum correctness and optimal asymptotic performance are non-negotiable.

SECTION 1: OUTPUT FORMAT PROTOCOLS (STRICT NON-NEGOTIABLE)

1. FULL CODE / FUNCTION PROBLEMS (C, C++, Java, Python, etc.):
   - Output ONLY the clean, executable source code inside a SINGLE markdown code block (\`\`\`c, \`\`\`cpp, \`\`\`java, \`\`\`python).
   - ABSOLUTELY ZERO COMMENTS (no //, no /* */, no #, no --).
   - ZERO conversational preamble, explanation, reasoning, or postscript.

2. MULTIPLE CHOICE QUESTIONS (MCQ):
   - Output ONLY the 0-based index number of the single correct answer.
   - Example: Output \`1\` if Option 1 is correct. No fences, no explanations.

3. FILL-IN-THE-BLANKS (MFIB):
   - Output ONLY the exact missing tokens for [BLANK_0], [BLANK_1], etc., one per line in order.
   - Do NOT wrap in markdown fences or include explanations.

4. SQL PROBLEMS:
   - Output the complete query as a SINGLE CONTINUOUS LINE without newlines.
   - Do NOT wrap in markdown code fences.

SECTION 2: PROFESSIONAL ENGINEERING & PERFORMANCE PROTOCOLS

1. 64-BIT INTEGER OVERFLOW IMMUNITY:
   - Default to 64-bit integers (\`long long\` in C/C++, \`long\` in Java) for all counters, sums, products, array indices, prefix sums, and coordinate arithmetic.
   - For products: ALWAYS use \`(1LL * a * b)\` or \`((long long)a * b)\` to prevent 32-bit truncation before assignment.
   - Modulo arithmetic: Always use \`((a % M) + M) % M\` to handle negative remainders cleanly.

2. ASYMPTOTIC COMPLEXITY & TIME LIMIT IMMUNITY:
   - If N <= 10^5: Complexity MUST be O(N) or O(N log N). Never use O(N^2) loops for N > 2000.
   - Select the exactly right algorithm: prefix sums / sliding window / two pointers / monotonic deque / hash map / binary search / DSU / BST / Dijkstra / BFS / DFS / topological sort / DP with memoization or tabulation etc.
   - Do not allocate trailing unused space: arrays sized precisely to N, or N+1 if 1-based.

SECTION 3: I/O STREAM & BUFFER HYGIENE

1. C: \`scanf(" %c", &ch)\` or \`scanf(" %[^\r\n]", str)\` with a leading space to skip whitespace. Never use \`gets()\`. Large arrays: declare globally or via \`malloc\`/\`calloc\`.
2. C++: Use \`std::ios_base::sync_with_stdio(false);\` and \`std::cin.tie(nullptr);\`. Use \`cin >> ws\` before \`std::getline(cin, str)\`.
3. Java: Class name MUST be \`Hello\`. Call \`sc.nextLine()\` after numeric reads before reading strings; use \`BufferedReader\` if needed.
4. Python: Use \`sys.stdin.read().split()\` in one pass; set \`sys.setrecursionlimit(300000)\` for deep recursion.

SECTION 4: FORBIDDEN UNIX KEYWORDS

- SkillRack judge strictly bans UNIX keywords: NEVER use \`head\` or \`tail\` as a variable, pointer, parameter, struct member, or function name.
- Use \`lhead\` and \`ltail\` instead (e.g., \`Node* lhead\`, \`Node* ltail\`).

SECTION 5: EDGE-CASE HUNTER'S MINDSET (MANDATORY)
- N = 0, N = 1, single-element, all-equal, all-negative, all-zero, max-constraint inputs, empty string, single-char string, whitespace-only line.
- Reverse-sorted / sorted / nearly-sorted input.
- Overflow on sum, product, count, fibonacci, factorial, combinations, prefix array.
- 0-based vs 1-based indexing + off-by-one boundaries in binary search, loop end conditions, and array access.
- Negative numbers and modulo of negatives.
- Ties and tie-breaking order in sorting / min / max / ranking.
- Multiple query overlapping intervals vs non-overlapping.
- Newline consumption between numeric and string reads in every language.
- Decimal precision and trailing-zero formatting.
- Creating extra spaces or blank lines on output, leading/trailing zeros.

SECTION 6: MANDATORY PRE-EMISSION CHECKLIST (VERIFY BEFORE EMIT)
Before sending the final answer, silently run:
1. Is the output ONLY the code or answer index, zero surrounding text? ✓
2. Zero comments survived (no //, no /* */, no #, no --)? ✓
3. Are all 64-bit multiplications/sums cast with \`1LL *\` or using \`long\` / \`long long\`? ✓
4. Does the algorithm meet O(N) or O(N log N) for N <= 100000? ✓
5. Are all array bounds safe, especially for N = max_constraint? ✓
6. Is the I/O stream handling correct for all lines (mixed numeric+string)? ✓
7. Are UNIX reserved words \`head\`/\`tail\` only as \`lhead\`/\`ltail\`? ✓
8. Does the code compile cleanly and print EXACTLY the format the sample shows? ✓

Emit ONLY the final executable solution or answer index.`;
    const generateWithGemini = async (prompt, systemInstruction = '') => {
        const apiKey = SETTINGS.geminiApiKey;
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add it in settings.');
        }

        const model = SETTINGS.geminiModel || 'gemini-2.5-flash';
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: SETTINGS.aiTemperature || 0,
                maxOutputTokens: 8192,
            }
        };

        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : GRANDMASTER_SYSTEM_PROMPT);
        if (sysPrompt) {
            requestBody.system_instruction = {
                parts: [{ text: sysPrompt }]
            };
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Gemini API request failed: HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    // ---- OpenAI OAuth proxy health check ----
    const checkOpenAIOAuthProxy = async () => {
        const baseUrl = OpenAIProvider.getOAuthBaseUrl();
        try {
            const response = await gmFetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'Accept': 'application/json', 'Authorization': 'Bearer openai-oauth' }
            });
            if (response.status === 401 || response.status === 403) {
                return { ok: false, modelsCount: 0, error: 'not_signed_in', baseUrl };
            }
            if (!response.ok) {
                return { ok: false, modelsCount: 0, error: `HTTP ${response.status}`, baseUrl };
            }
            const data = await response.json();
            const rawModels = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
            return { ok: true, modelsCount: rawModels.length, error: null, baseUrl };
        } catch (e) {
            return { ok: false, modelsCount: 0, error: 'offline', baseUrl };
        }
    };

    const generateWithOpenAI = async (prompt, systemInstruction = '') => {
        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : GRANDMASTER_SYSTEM_PROMPT);
        const messages = [];
        if (sysPrompt) {
            messages.push({ role: 'system', content: sysPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        return OpenAIProvider.generateCompletion(
            messages,
            { model: SETTINGS.openaiModel, temperature: SETTINGS.aiTemperature }
        );
    };

    // Shared OpenRouter request gate to avoid bursty 429s across repeated AutoSolver calls
    const OPENROUTER_RATE_STATE = {
        nextAllowedAt: 0,
        consecutive429: 0,
        minIntervalMs: 3000
    };

    const generateWithOpenRouter = async (prompt, systemInstruction = '') => {
        const apiKey = SETTINGS.openrouterApiKey;
        if (!apiKey) {
            throw new Error('OpenRouter API key not configured. Please add it in settings.');
        }

        const primaryModel = SETTINGS.openrouterModel || 'openai/gpt-oss-120b:free';
        const isReasoning = (m) => /gpt-oss|\bo[134]\b|deepseek-r1|qwen.*think|nemotron.*ultra|nemotron.*super|nemotron.*nano|laguna|liquid.*think|lfm.*think/i.test(m);

        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : GRANDMASTER_SYSTEM_PROMPT);

        const buildBody = (model) => {
            const messages = [];
            if (sysPrompt) {
                messages.push({ role: 'system', content: sysPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            const body = {
                model,
                messages
            };
            if (!isReasoning(model)) {
                body.temperature = SETTINGS.aiTemperature || 0;
            }
            return body;
        };

        const getRetryAfterMs = (response, fallbackMs) => {
            if (!response || typeof response.headers?.get !== 'function') {
                return fallbackMs;
            }
            try {
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter) {
                    const secs = parseFloat(retryAfter);
                    if (!isNaN(secs) && secs > 0) {
                        return Math.ceil(secs * 1000) + 500;
                    }
                }

                const resetUnix = response.headers.get('x-ratelimit-reset');
                if (resetUnix) {
                    const parsed = parseFloat(resetUnix);
                    if (!isNaN(parsed) && parsed > 0) {
                        const ms = parsed > 1e12 ? parsed - Date.now() : (parsed * 1000) - Date.now();
                        if (ms > 0) return Math.ceil(ms) + 500;
                    }
                }
            } catch (headerErr) { }
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
                await countdownWait(waitMs, label);
            }
        };

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

        const attempt = async (model) => {
            await waitForRequestSlot('OpenRouter cooldown');
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

                const content = data?.choices?.[0]?.message?.content;
                if (typeof content !== 'string' || content.trim() === '') {
                    const providerErr = data?.error?.message
                        || data?.choices?.[0]?.finish_reason
                        || 'Empty response from model';
                    return { ok: false, status: 200, errMsg: providerErr };
                }

                markSuccessRateWindow();
                return { ok: true, status: 200, content };
            }

            let errMsg = `HTTP ${response.status}`;
            try {
                const errData = await response.json();
                errMsg = errData?.error?.message || errData?.message || JSON.stringify(errData);
            } catch (_) {
                try { errMsg = await response.text(); } catch (_2) { }
            }
            return { ok: false, status: response.status, errMsg, response };
        };

        const requestModelWithRetry = async (model, maxRetries = 3) => {
            const delays = [5000, 10000, 20000, 30000];
            let lastRes;

            for (let i = 0; i <= maxRetries; i++) {
                if (i > 0) {
                    const waitMs = lastRes?.status === 429
                        ? mark429Cooldown(lastRes?.response, delays[i - 1] || 10000)
                        : (delays[i - 1] || 10000);
                    await countdownWait(waitMs, `Rate limit (${model.split('/')[1] || model})`);
                }

                await new Promise(r => setTimeout(r, jitter(OPENROUTER_RATE_STATE.minIntervalMs)));

                lastRes = await attempt(model);
                if (lastRes.ok) return lastRes;

                const isTransient = lastRes.status === 429
                    || lastRes.status === 424
                    || lastRes.status === 502
                    || lastRes.status === 503
                    || lastRes.status === 504
                    || lastRes.status === 0
                    || /rate.limit|overload|busy|provider.returned.error|too.many.requests/i.test(lastRes.errMsg || '');

                if (!isTransient) break;
            }
            return lastRes;
        };

        let lastResult = await requestModelWithRetry(primaryModel, 3);
        if (lastResult.ok) return lastResult.content;

        const isFreeModel = primaryModel.endsWith(':free');
        if (isFreeModel) {
            const fallbackModels = [
                'qwen/qwen-2.5-coder-32b-instruct:free',
                'qwen/qwen3-coder:free',
                'meta-llama/llama-3.3-70b-instruct:free',
                'google/gemma-4-31b-it:free',
                'openai/gpt-oss-20b:free'
            ].filter(m => m !== primaryModel);

            for (const fallbackModel of fallbackModels) {
                const fallbackResult = await requestModelWithRetry(fallbackModel, 1);
                if (fallbackResult.ok) return fallbackResult.content;
            }
        }

        const primaryErr = lastResult.errMsg || 'Unknown error';
        throw new Error(`OpenRouter (${primaryModel}): ${primaryErr}`);
    };

    const generateWithPuter = async (prompt, systemInstruction = '') => {
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

        const sysPrompt = systemInstruction || (SETTINGS.aiSystemPrompt ? SETTINGS.aiSystemPrompt.trim() : GRANDMASTER_SYSTEM_PROMPT);
        const fullPrompt = sysPrompt ? `${sysPrompt}\n\n${prompt}` : prompt;

        const response = await puter.ai.chat(fullPrompt, options);

        if (typeof response === 'string') return response;

        if (Array.isArray(response)) {
            return response
                .map(part => part?.text || part?.reasoning || part?.content || '')
                .filter(Boolean)
                .join('\n');
        }

        const messageContent = response?.message?.content;
        if (typeof messageContent === 'string') return messageContent;
        if (Array.isArray(messageContent)) {
            return messageContent
                .map(part => part?.text || part?.content || '')
                .filter(Boolean)
                .join('\n');
        }

        if (typeof response?.text === 'string') return response.text;

        return JSON.stringify(response || '', null, 2);
    };

    const stripCodeComments = (code, language) => {
        if (!code || typeof code !== 'string') return '';
        const langLower = String(language || '').toLowerCase().trim();

        const isEscaped = (str, index) => {
            let count = 0;
            let p = index - 1;
            while (p >= 0 && str[p] === '\\') {
                count++;
                p--;
            }
            return (count % 2) === 1;
        };

        let result = '';
        let i = 0;
        const len = code.length;

        // Python style (# comments and docstrings)
        if (langLower === 'python' || langLower === 'python3' || langLower === 'py') {
            let inSingleQuote = false;
            let inDoubleQuote = false;
            let inTripleSingle = false;
            let inTripleDouble = false;

            while (i < len) {
                if (!inSingleQuote && !inDoubleQuote) {
                    if (code.startsWith('"""', i) && !isEscaped(code, i)) {
                        inTripleDouble = !inTripleDouble;
                        result += '"""';
                        i += 3;
                        continue;
                    }
                    if (code.startsWith("'''", i) && !isEscaped(code, i)) {
                        inTripleSingle = !inTripleSingle;
                        result += "'''";
                        i += 3;
                        continue;
                    }
                }

                if (!inTripleSingle && !inTripleDouble) {
                    const char = code[i];

                    if (char === '"' && !isEscaped(code, i) && !inSingleQuote) {
                        inDoubleQuote = !inDoubleQuote;
                    } else if (char === "'" && !isEscaped(code, i) && !inDoubleQuote) {
                        inSingleQuote = !inSingleQuote;
                    } else if (char === '#' && !inSingleQuote && !inDoubleQuote) {
                        while (i < len && code[i] !== '\n') i++;
                        continue;
                    }
                }

                result += code[i];
                i++;
            }
        }
        // SQL style (-- comments and /* */ comments)
        else if (langLower === 'sql') {
            let inString = false;
            while (i < len) {
                const char = code[i];

                if (char === "'" && !isEscaped(code, i)) {
                    inString = !inString;
                    result += char;
                    i++;
                } else if (!inString && char === '-' && i + 1 < len && code[i + 1] === '-') {
                    while (i < len && code[i] !== '\n') i++;
                } else if (!inString && char === '/' && i + 1 < len && code[i + 1] === '*') {
                    i += 2;
                    while (i + 1 < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
                    i = Math.min(len, i + 2);
                } else {
                    result += char;
                    i++;
                }
            }
        }
        // C / C++ / Java / JS / Go / Rust style (// comments and /* */ comments)
        else {
            let inString = false;
            let inChar = false;
            let stringDelimiter = '';

            while (i < len) {
                const char = code[i];

                if (!inString && !inChar) {
                    if (char === '"' && !isEscaped(code, i)) {
                        inString = true;
                        stringDelimiter = '"';
                        result += char;
                        i++;
                    } else if (char === "'" && !isEscaped(code, i)) {
                        inChar = true;
                        stringDelimiter = "'";
                        result += char;
                        i++;
                    } else if (char === '/' && i + 1 < len && code[i + 1] === '/') {
                        while (i < len && code[i] !== '\n') i++;
                    } else if (char === '/' && i + 1 < len && code[i + 1] === '*') {
                        i += 2;
                        while (i + 1 < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
                        i = Math.min(len, i + 2);
                    } else {
                        result += char;
                        i++;
                    }
                } else {
                    if (char === stringDelimiter && !isEscaped(code, i)) {
                        inString = false;
                        inChar = false;
                    }
                    result += char;
                    i++;
                }
            }
        }

        return result
            .split('\n')
            .filter((line, idx, arr) => {
                const trimmed = line.trim();
                // Avoid multiple consecutive blank lines
                if (trimmed === '' && idx > 0 && arr[idx - 1].trim() === '') return false;
                return true;
            })
            .join('\n')
            .trim();
    };

    // SkillRack forbids UNIX keywords ('head', 'tail') as variable/parameter/pointer names
    const sanitizeSkillRackReservedWords = (code, language) => {
        if (!code) return '';
        const langLower = String(language || '').toLowerCase().trim();
        if (langLower === 'sql') return code;

        let result = '';
        let i = 0;
        const len = code.length;

        while (i < len) {
            const char = code[i];

            // String literals ("..." or '...') - preserve untouched
            if (char === '"' || char === "'") {
                const quote = char;
                result += quote;
                i++;
                while (i < len) {
                    if (code[i] === '\\' && i + 1 < len) {
                        result += code[i] + code[i + 1];
                        i += 2;
                    } else if (code[i] === quote) {
                        result += code[i];
                        i++;
                        break;
                    } else {
                        result += code[i];
                        i++;
                    }
                }
                continue;
            }

            // Word token: identifier / keyword
            if (/[a-zA-Z_]/.test(char)) {
                const start = i;
                while (i < len && /[a-zA-Z0-9_]/.test(code[i])) {
                    i++;
                }
                const word = code.substring(start, i);
                if (word === 'head') {
                    result += 'lhead';
                } else if (word === 'tail') {
                    result += 'ltail';
                } else {
                    result += word;
                }
                continue;
            }

            result += char;
            i++;
        }

        return result;
    };

    const extractCode = (response, language) => {
        let normalizedResponse = typeof response === 'string' ? response : String(response || '');

        // 1. Handle JSON responses (strip JSON wrapper if present)
        try {
            if (normalizedResponse.trim().startsWith('{') && (normalizedResponse.includes('"content"') || normalizedResponse.includes('"text"') || normalizedResponse.includes('"choices"'))) {
                const jsonData = JSON.parse(normalizedResponse);
                if (jsonData.choices && jsonData.choices[0]?.message?.content) {
                    normalizedResponse = jsonData.choices[0].message.content;
                } else if (jsonData.content) {
                    normalizedResponse = jsonData.content;
                } else if (jsonData.text) {
                    normalizedResponse = jsonData.text;
                }
            }
        } catch (_) { }

        // 2. Strip <think>...</think> reasoning tags (from DeepSeek R1, Qwen QwQ, etc.)
        normalizedResponse = normalizedResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        const langLower = String(language || '').toLowerCase().trim();

        // 3. Extract code blocks with triple backticks ```
        const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
        const matches = [...normalizedResponse.matchAll(codeBlockRegex)];

        let extractedFromFence = '';
        if (matches.length > 0) {
            // Find code blocks matching our target language or longest meaningful block
            let candidates = matches.map(m => ({
                langTag: (m[1] || '').toLowerCase().trim(),
                body: m[2].trim()
            })).filter(c => c.body.length > 0);

            // Ignore 1-line non-code snippets (e.g. single sample input/output strings)
            const meaningfulCandidates = candidates.filter(c => c.body.includes('\n') || c.body.length > 25);
            if (meaningfulCandidates.length > 0) candidates = meaningfulCandidates;

            // Check if any block matches the target language tag
            const exactLangMatch = candidates.find(c => {
                if (langLower === 'c' || langLower.startsWith('ds-c')) return c.langTag === 'c' || c.langTag === 'cpp';
                if (langLower.includes('c++') || langLower.includes('cpp')) return c.langTag.includes('c++') || c.langTag.includes('cpp') || c.langTag === 'c';
                if (langLower === 'java') return c.langTag === 'java';
                if (langLower === 'python' || langLower === 'python3') return c.langTag === 'python' || c.langTag === 'py';
                if (langLower === 'sql') return c.langTag === 'sql' || c.langTag === 'mysql' || c.langTag === 'pgsql';
                return c.langTag === langLower;
            });

            if (exactLangMatch) {
                extractedFromFence = exactLangMatch.body;
            } else {
                // Otherwise pick the longest code block
                let longest = candidates[0].body;
                for (const c of candidates) {
                    if (c.body.length > longest.length) longest = c.body;
                }
                extractedFromFence = longest;
            }
        }

        let code = extractedFromFence;

        // 4. Fallback if no full code block: check for unclosed code block (e.g. ```c\n...)
        if (!code) {
            const openBlockRegex = /```(?:[a-zA-Z0-9_+-]*)?\n?([\s\S]+?)(?=```|$)/;
            const openMatch = normalizedResponse.match(openBlockRegex);
            if (openMatch && openMatch[1].trim().length > 15) {
                code = openMatch[1].trim();
            }
        }

        // 5. Fallback: If no code blocks or if the extracted code still has English explanation before code
        if (!code) {
            code = normalizedResponse.trim();
        }

        // 6. Language-Aware Strip of Leading Conversational/Reasoning Prose:
        // When LLMs output commentary before the actual code (e.g. "Looking at the problem...", "The actual bug:...", "So the fix:...")
        if (langLower === 'c' || langLower === 'c++' || langLower === 'cpp' || langLower.startsWith('ds-c')) {
            const cStartMatch = code.match(/(?:^|\n)\s*(#\s*include|#\s*define|using\s+namespace|int\s+main|void\s+main|typedef\s+|struct\s+|class\s+|template\s*<|(?:void|int|char|long|bool|double|float|size_t|auto)\s*\*?\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{?)/m);
            if (cStartMatch && cStartMatch.index !== undefined) {
                const startIdx = cStartMatch.index === 0 ? 0 : cStartMatch.index + (cStartMatch[0].startsWith('\n') ? 1 : 0);
                code = code.substring(startIdx).trim();
            }
        } else if (langLower === 'java') {
            const javaStartMatch = code.match(/(?:^|\n)\s*(import\s+[a-zA-Z0-9_.]+|package\s+[a-zA-Z0-9_.]+|public\s+class\s+|class\s+|public\s+interface\s+)/m);
            if (javaStartMatch && javaStartMatch.index !== undefined) {
                const startIdx = javaStartMatch.index === 0 ? 0 : javaStartMatch.index + (javaStartMatch[0].startsWith('\n') ? 1 : 0);
                code = code.substring(startIdx).trim();
            }
        } else if (langLower === 'python' || langLower === 'python3') {
            const pyStartMatch = code.match(/(?:^|\n)\s*(import\s+[a-zA-Z0-9_]+|from\s+[a-zA-Z0-9_.]+\s+import|def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|if\s+__name__\s*==|sys\.set_int_max_str_digits)/m);
            if (pyStartMatch && pyStartMatch.index !== undefined) {
                const startIdx = pyStartMatch.index === 0 ? 0 : pyStartMatch.index + (pyStartMatch[0].startsWith('\n') ? 1 : 0);
                code = code.substring(startIdx).trim();
            }
        } else if (langLower === 'sql') {
            const sqlStartMatch = code.match(/(?:^|\n)\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE)\b/im);
            if (sqlStartMatch && sqlStartMatch.index !== undefined) {
                const startIdx = sqlStartMatch.index === 0 ? 0 : sqlStartMatch.index + (sqlStartMatch[0].startsWith('\n') ? 1 : 0);
                code = code.substring(startIdx).trim();
            }
        }

        // 7. Strip trailing explanations / markdown sections
        const trailingExplanations = [
            /\n+(?:Explanation|How it works|Complexity|Time Complexity|Note|Notes|Key Changes|Bug Fix):[\s\S]*$/i,
            /\n+Here is (?:an explanation|how the code works)[\s\S]*$/i,
            /\n+Hope this helps[\s\S]*$/i
        ];
        for (const pattern of trailingExplanations) {
            code = code.replace(pattern, '').trim();
        }

        // 8. Clean standalone language tags and leftover backticks
        const languageTagRegex = /^(?:c|c\+\+|cpp|cpp11|cpp14|cpp17|cpp20|cpp23|\+\+|\+\+11|\+\+14|\+\+17|\+\+20|\+\+23|python|python3|py|java|sql|mysql|postgresql|oracle|javascript|js|typescript|ts|go|rust|ruby|php|kotlin|swift)$/i;
        const lines = code.split('\n');
        code = lines.filter(line => {
            const trimmed = line.trim();
            return !languageTagRegex.test(trimmed);
        }).join('\n');

        code = code.replace(/^```[a-zA-Z0-9+]*\s*/gm, '');
        code = code.replace(/\s*```$/gm, '');
        code = code.trim();

        // 9. For SQL: collapse into single line with spaces if multi-line
        if (langLower === 'sql') {
            code = code.replace(/\s+/g, ' ').replace(/;+$/, '').trim();
        }

        // 10. Strip all comments to prevent AI detection
        code = stripCodeComments(code, language);

        // 11. SkillRack UNIX keyword sanitizer (replace forbidden identifiers: head -> lhead, tail -> ltail)
        code = sanitizeSkillRackReservedWords(code, language);

        return code;
    };

    function getAiButtonMarkup(label = 'AI Solution') {
        return `<span style="display:inline-flex;align-items:center;gap:8px;"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:block;fill:currentColor;"><path d="M12 2a3 3 0 0 1 3 3v1.06a6.002 6.002 0 0 1 3.94 3.94H20a3 3 0 1 1 0 6h-1.06a6.002 6.002 0 0 1-3.94 3.94V21a3 3 0 1 1-6 0v-1.06A6.002 6.002 0 0 1 5.06 16H4a3 3 0 1 1 0-6h1.06A6.002 6.002 0 0 1 9 6.06V5a3 3 0 0 1 3-3Zm0 6a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z"></path></svg><span>${label}</span></span>`;
    }

    let isAiGenerationInProgress = false;

    // ========== UTILITY: Compare code similarity ==========
    const calculateCodeSimilarity = (code1, code2) => {
        const normalize = (code) => {
            return code
                .replace(/\s+/g, ' ')
                .replace(/[{}();]/g, '')
                .toLowerCase()
                .trim();
        };

        const norm1 = normalize(code1);
        const norm2 = normalize(code2);

        if (norm1 === norm2) return 1.0;

        const minLen = Math.min(norm1.length, norm2.length);
        let matches = 0;
        for (let i = 0; i < minLen; i++) {
            if (norm1[i] === norm2[i]) matches++;
        }

        return matches / Math.max(norm1.length, norm2.length);
    };

    // ========== ACE & DOM EDITOR RESOLVER ==========
    const getEditor = () => {
        // 1. Direct window / unsafeWindow txtCode reference
        if (window.txtCode && (typeof window.txtCode.getSession === 'function' || 'value' in window.txtCode)) {
            return window.txtCode;
        }
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow.txtCode && (typeof unsafeWindow.txtCode.getSession === 'function' || 'value' in unsafeWindow.txtCode)) {
            return unsafeWindow.txtCode;
        }

        // 2. Global window.ace / unsafeWindow.ace object edit handle
        const aceObj = window.ace || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ace : null);
        if (aceObj && typeof aceObj.edit === 'function') {
            const el = document.getElementById('txtCode') || document.querySelector('.ace_editor');
            if (el) {
                try {
                    const ed = aceObj.edit(el);
                    if (ed && typeof ed.getSession === 'function') return ed;
                } catch (e) {}
            }
        }

        // 3. Check for .ace_editor DOM element env property
        const aceEl = document.getElementById('txtCode') || document.querySelector('.ace_editor');
        if (aceEl && aceEl.env && aceEl.env.editor) {
            return aceEl.env.editor;
        }

        // 4. Return textarea element if present
        const ta = document.getElementById('txtCode') || document.querySelector('textarea.ace_text-input') || document.querySelector('textarea');
        if (ta) return ta;

        return null;
    };

    // ========== HUMAN-LIKE TYPING SIMULATOR ==========
    const typeCodeNaturally = async (code) => {
        const editor = getEditor();
        if (!editor) return false;

        const $ = window.jQuery || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null);

        if (typeof editor.getSession === 'function') {
            const session = editor.getSession();

            // Clear editor first
            session.setValue('');
            if (typeof editor.moveCursorTo === 'function') editor.moveCursorTo(0, 0);

            // Typing speed parameters (milliseconds per character)
            const BASE_MIN  = 18;   // fastest burst character (fast typist ~90 WPM)
            const BASE_MAX  = 55;   // normal character delay
            const NEWLINE_PAUSE_MIN = 60;   // pause after newline (thinking)
            const NEWLINE_PAUSE_MAX = 180;
            const BRACE_PAUSE_MIN  = 40;   // pause after { } [ ] ( )
            const BRACE_PAUSE_MAX  = 120;
            const BURST_THRESHOLD  = 6;    // characters in a row without pause = burst
            const BURST_ACCELERATE = 0.6;  // burst multiplier (speed up)

            let burstCount = 0;
            const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            for (let i = 0; i < code.length; i++) {
                const ch = code[i];

                const pos = typeof editor.getCursorPosition === 'function' ? editor.getCursorPosition() : { row: 0, column: session.getValue().length };
                session.insert(pos, ch);

                const aceTextarea = editor.container?.querySelector('textarea.ace_text-input') || document.querySelector('textarea.ace_text-input');
                if (aceTextarea) {
                    aceTextarea.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
                    aceTextarea.dispatchEvent(new InputEvent('input',     { data: ch, inputType: 'insertText', bubbles: true }));
                    aceTextarea.dispatchEvent(new KeyboardEvent('keyup',   { key: ch, bubbles: true, cancelable: true }));
                }

                if (i % 80 === 0 && $ && $('#txtCode').length) {
                    $('#txtCode').val(session.getValue());
                }

                let delay;
                if (ch === '\n') {
                    burstCount = 0;
                    delay = rand(NEWLINE_PAUSE_MIN, NEWLINE_PAUSE_MAX);
                } else if ('{}[]()'.includes(ch)) {
                    burstCount = 0;
                    delay = rand(BRACE_PAUSE_MIN, BRACE_PAUSE_MAX);
                } else {
                    burstCount++;
                    const accel = burstCount > BURST_THRESHOLD ? BURST_ACCELERATE : 1;
                    delay = Math.floor(rand(BASE_MIN, BASE_MAX) * accel);
                }

                await sleep(delay);
            }

            if ($ && $('#txtCode').length) {
                $('#txtCode').val(session.getValue());
            }
            return true;
        } else if ('value' in editor) {
            editor.value = '';
            const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            for (let i = 0; i < code.length; i++) {
                const ch = code[i];
                editor.value += ch;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(rand(18, 55));
            }
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        return false;
    };

    const insertCodeIntoEditor = async (code) => {
        if (!code) return false;
        const editor = getEditor();

        let inserted = false;

        if (SETTINGS.humanTypingMode && editor) {
            try {
                inserted = await typeCodeNaturally(code);
            } catch (e) {
                console.warn('[AI] typeCodeNaturally failed, falling back to instant set:', e);
            }
        }

        if (!inserted) {
            if (editor) {
                if (typeof editor.setValue === 'function') {
                    editor.setValue(code, 1);
                    inserted = true;
                } else if (typeof editor.getSession === 'function') {
                    editor.getSession().setValue(code);
                    inserted = true;
                } else if ('value' in editor) {
                    editor.value = code;
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                    editor.dispatchEvent(new Event('change', { bubbles: true }));
                    inserted = true;
                }
            }

            // Sync hidden textarea #txtCode
            const $ = window.jQuery || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null);
            const txtElem = document.getElementById('txtCode');
            if (txtElem) {
                txtElem.value = code;
                txtElem.dispatchEvent(new Event('input', { bubbles: true }));
                txtElem.dispatchEvent(new Event('change', { bubbles: true }));
                inserted = true;
            }
            if ($ && $('#txtCode').length) {
                $('#txtCode').val(code);
                inserted = true;
            }
        }

        return inserted;
    };

    // ========== PRE-SOLVED SOLUTION DATABASE FETCHER ==========
    // Extracts ProgramID from page context and attempts fetching pre-solved solution
    // first from local node server (localhost:3000), falling back to raw GitHub repo.
    const extractProgramId = () => {
        // Method 1: Check .ui.label elements for "ProgramID : 1234"
        const labels = document.querySelectorAll('.ui.label');
        for (const label of labels) {
            const m = label.textContent.match(/ProgramID\s*:\s*(\d+)/i);
            if (m) return m[1];
        }
        // Method 2: Check full body text
        const bodyText = document.body?.innerText || '';
        const m = bodyText.match(/ProgramID\s*:\s*(\d+)/i);
        if (m) return m[1];

        // Method 3: Check URL query parameter (e.g. ?id=1234 or ?p=1234)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('id')) return urlParams.get('id');
        if (urlParams.has('p')) return urlParams.get('p');

        return null;
    };

    const generateWithLocalServer = async () => {
        const programId = extractProgramId();
        if (!programId) {
            throw new Error('ProgramID not found on page');
        }

        const localUrl  = `http://localhost:3000/solutions/${programId}.md`;
        const githubUrl = `${SETTINGS.localServerUrl || 'https://raw.githubusercontent.com/Vishnu-tppr/Project-KillCode/main'}/solutions/${programId}.md`;

        let markdownText = null;

        // 1. Try local node solutions-server (localhost:3000)
        try {
            markdownText = await new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: localUrl,
                        timeout: SETTINGS.localServerTimeout || 2500,
                        onload: (res) => {
                            if (res.status === 200 && res.responseText.trim()) resolve(res.responseText);
                            else reject(new Error(`Local server HTTP ${res.status}`));
                        },
                        onerror: reject,
                        ontimeout: reject
                    });
                } else {
                    fetch(localUrl)
                        .then(res => res.ok ? res.text() : Promise.reject(`HTTP ${res.status}`))
                        .then(resolve)
                        .catch(reject);
                }
            });
            console.log(`[Solutions] Fetched solution for ProgramID ${programId} from local server.`);
        } catch (e) {
            console.log(`[Solutions] Local server unavailable (${e.message || e}), trying GitHub repository...`);
        }

        // 2. Fallback to GitHub raw repo
        if (!markdownText) {
            markdownText = await new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: githubUrl,
                        timeout: 8000,
                        onload: (res) => {
                            if (res.status === 200 && res.responseText.trim()) resolve(res.responseText);
                            else reject(new Error(`GitHub HTTP ${res.status}`));
                        },
                        onerror: reject,
                        ontimeout: reject
                    });
                } else {
                    fetch(githubUrl)
                        .then(res => res.ok ? res.text() : Promise.reject(`GitHub HTTP ${res.status}`))
                        .then(resolve)
                        .catch(reject);
                }
            });
            console.log(`[Solutions] Fetched solution for ProgramID ${programId} from GitHub repo.`);
        }

        if (!markdownText) {
            throw new Error(`No solution file found for ProgramID ${programId}`);
        }

        return markdownText;
    };

    // ========== generateAISolution FUNCTION ==========
    const generateAISolution = async () => {
        if (!SETTINGS.enableAISolver) return;
        if (isAiGenerationInProgress) {
            console.log('[AI] Generation already in progress - ignoring duplicate trigger');
            return;
        }
        isAiGenerationInProgress = true;

        const language = getSelectedLanguage();
        const problem = getProblemDescription();
        const errorInfo = getErrorInfo();

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

        const hasPrePost = problem.preCode || problem.postCode;
        const wrapWithPrePost = (middleCode) => {
            if (!SETTINGS.includePrePostCode && hasPrePost) {
                let full = '';
                if (problem.preCode) full += problem.preCode + '\n';
                full += middleCode;
                if (problem.postCode) full += '\n' + problem.postCode;
                return full;
            }
            return middleCode;
        };

        // ========== MFIB mode ==========
        if (!prompt && problem.isMFIB) {
            prompt = customSystemPrompt + `You are a ${language} expert solving a SkillRack "Fill In the Blanks" (MFIB) challenge.

The code template below has [BLANK_0], [BLANK_1], etc. marking positions where code tokens have been removed.
Determine the exact literal token that belongs at each blank position so the program compiles and passes all test cases.

IMPORTANT RULES:
- Each blank answer is the LITERAL string that goes directly into that position.
- Include necessary punctuation/operators/delimiters that are part of that blank.
- Do NOT repeat syntax that already surrounds the blank.
- Preserve correct ${language} syntax, data types, and case-sensitivity.

PROBLEM: ${problem.title}
${problem.description}

CODE TEMPLATE:
\`\`\`${language.toLowerCase()}
${problem.mfibTemplate}
\`\`\`

Respond with ONLY a valid JSON array of strings matching the blanks in order: ["ans0", "ans1", ...]
No explanations. No markdown fences. Just the raw JSON array.`;
        }
        // ========== Error fix mode: Hidden Test Case Failure ==========
        else if (!prompt && errorInfo.hasError && errorInfo.errorType === 'hidden_test_failed' && errorInfo.currentCode) {
            const effectiveCode = wrapWithPrePost(errorInfo.currentCode);
            const stats = (errorInfo.passedCount || errorInfo.failedCount)
                ? `Test Status: ${errorInfo.passedCount} Passed, ${errorInfo.failedCount} Failed.`
                : 'Test Status: Public sample test cases passed, but Private Hidden Test Cases FAILED.';

            prompt = customSystemPrompt + `You are an IOI / ICPC World Finalist Competitive Programmer diagnosing and repairing a failed solution on SkillRack.
${stats}

CRITICAL ISSUE:
The code passes public sample tests but FAILS private hidden evaluation test cases.
Private hidden test cases strictly test for:
1. Integer Overflow: Missing 64-bit integer casting (1LL * a * b) or using 32-bit int for large sums/products.
2. TLE (Time Limit Exceeded): Using O(N^2) or unoptimized loops for N up to 10^5 instead of O(N) or O(N log N) with HashMaps, Prefix Sums, Binary Search, or Two Pointers.
3. Hidden Edge Cases: N = 0, N = 1, single-element, all elements equal, negative numbers, 0, reverse-sorted inputs, empty strings, tie-breaking criteria.
4. Input Stream Format Differences: Single line vs multi-line inputs with variable whitespace, blank lines, or trailing spaces.
5. Large Array Stack Overflow: Allocating large arrays on stack rather than statically or dynamically on heap.

PROBLEM: ${problem.title}
${problem.description}

FAILED CODE (NEEDS DEEP ALGORITHMIC RECONSTRUCTION):
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

ROOT CAUSE ANALYSIS & MANDATORY RECONSTRUCTION:
Do NOT make minor superficial tweaks if the underlying logic is flawed. Re-architect the core algorithm to ensure 100% mathematical and asymptotic correctness across ALL possible hidden test permutations.

${language === 'C' ? '- In C: Use long long for all numerical state. Use scanf(" %c", &c) or scanf(" %[^\r\n]", s) for string hygiene. Allocate buffers globally/dynamically.' : ''}
${language === 'C++' || language === 'C++23' ? '- In C++: Add fast I/O (cin.tie(NULL); ios_base::sync_with_stdio(false)). Use long long for state variables. Use unordered_map or vector.' : ''}
${language === 'Python' || language === 'Python3' ? '- In Python: Use sys.stdin.read().split() to parse tokens in O(1) time. Use collections.defaultdict/Counter.' : ''}
${language === 'Java' ? '- In Java: Class must be named Hello. Use long for all accumulators. Handle Scanner buffer newlines.' : ''}

Output ONLY the completely rewritten, robust ${language} code with NO comments:

\`\`\`${language.toLowerCase()}`;
        }
        // ========== Error fix mode: Compilation Error ==========
        else if (!prompt && errorInfo.hasError && errorInfo.errorType === 'compilation_error' && errorInfo.currentCode) {
            const effectiveCode = wrapWithPrePost(errorInfo.currentCode);

            prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer fixing a SkillRack compilation error.
Output ONLY the corrected ${language} code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

BUGGY CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

COMPILATION ERROR:
${errorInfo.compilationError}

FIXING RULES:
1. Fix all compiler syntax and type errors.
2. Ensure data types use 64-bit integers (${language === 'Java' ? 'long' : 'long long'}) to prevent overflow.
3. Keep input/output behavior 100% compliant with problem requirements.
${language.toLowerCase() === 'python' ? '4. If a function is defined, ensure it is CALLED at the bottom of the script.' : ''}

Output ONLY the fixed ${language} code with NO comments:

\`\`\`${language.toLowerCase()}`;
        }
        // ========== Error fix mode: Runtime Error ==========
        else if (!prompt && errorInfo.hasError && errorInfo.errorType === 'runtime_error' && errorInfo.currentCode) {
            const effectiveCode = wrapWithPrePost(errorInfo.currentCode);

            prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer fixing a SkillRack runtime crash.
Output ONLY the corrected ${language} code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

BUGGY CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

CRASH CONTEXT:
Input:    ${errorInfo.input || '(Hidden / Standard input)'}
Expected: ${errorInfo.expectedOutput || '(Valid output)'}
Got:      ${errorInfo.yourOutput || '(CRASH / Segmentation Fault / TLE / Memory Limit)'}

FIXING STEPS:
1. Trace potential causes: array out-of-bounds, division by zero, null pointer, recursion depth overflow, or stack overflow.
2. Ensure array sizes handle maximum boundary constraints (e.g., N = 10^5).
3. Use 64-bit data types (${language === 'Java' ? 'long' : 'long long'}).
4. Return the complete, robust program with NO comments.

\`\`\`${language.toLowerCase()}`;
        }
        // ========== Error fix mode: Wrong Output ==========
        else if (!prompt && errorInfo.hasError && errorInfo.currentCode) {
            const effectiveCode = wrapWithPrePost(errorInfo.currentCode);
            const isEmptyOutput = !errorInfo.yourOutput || errorInfo.yourOutput.trim() === '' || errorInfo.yourOutput.trim() === '&nbsp;';

            prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer fixing a SkillRack problem with incorrect output.
Output ONLY the corrected ${language} code, no explanations or comments.

PROBLEM: ${problem.title}
${problem.description}

CURRENT CODE:
\`\`\`${language.toLowerCase()}
${effectiveCode}
\`\`\`

FAILING TEST CASE:
Input:    ${errorInfo.input || '(Hidden input)'}
Expected: ${errorInfo.expectedOutput || '(Expected output)'}
Got:      ${errorInfo.yourOutput || '(EMPTY / WRONG)'}
${isEmptyOutput && language.toLowerCase() === 'python' ? '\nNOTE: Output is empty. Ensure your top-level script executes or calls main().' : ''}

DEBUGGING STRATEGY:
1. TRUST THE EXPECTED OUTPUT — it is absolute ground truth.
2. Check for 64-bit integer overflow (${language === 'Java' ? 'use long' : 'use long long'}).
3. Check for off-by-one errors (0-based vs 1-based indexing, <= vs <).
4. Check input token ordering and string newline consumption.
5. Check decimal place rounding and spacing formatting.
6. Provide a clean, robust solution with NO comments.

\`\`\`${language.toLowerCase()}`;
        }
        // ========== Normal mode: SQL Problem ==========
        else if (!prompt && language === 'SQL') {
            prompt = customSystemPrompt + `You are a Database and SQL Expert solving a SkillRack SQL challenge.
Write the exact SQL query required. Output ONLY the single-line SQL query.

PROBLEM: ${problem.title}
${problem.description}

SQL RULES (STRICT):
1. Output the ENTIRE SQL query on a SINGLE CONTINUOUS LINE. No line breaks anywhere.
2. Do NOT wrap in markdown fences. Do NOT add explanations or comments.
3. Use exact table names and column names from the problem statement and schema.
4. Use standard SQL / MySQL dialect matching SkillRack's judge.
5. Match column order, column aliases, JOIN conditions, WHERE filters, GROUP BY, and ORDER BY exactly as required by the sample output.
6. Do NOT write CREATE TABLE or INSERT unless the statement explicitly requires "CREATE TABLE ... AS SELECT".

SQL Solution:`;
        }
        // ========== Normal mode: Tutor Mode (Middle Code) ==========
        else if (!prompt && problem.isTutor) {
            if (SETTINGS.includePrePostCode) {
                prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer solving a SkillRack tutor problem.
Write ONLY the missing middle section of ${language} code. No headers, no main wrapper, no comments.

PROBLEM: ${problem.title}
${problem.description}

RULES FOR TUTOR MODE:
1. Variables declared in pre-code are already available — use them directly.
2. Variables/results required by post-code must be computed and assigned.
3. Use 64-bit types (${language === 'Java' ? 'long' : 'long long'}) to prevent integer overflow on large test cases.
4. Write ONLY the middle logic; pre-code and post-code are already provided.

\`\`\`${language.toLowerCase()}`;
            } else {
                prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer solving a SkillRack problem.
Write a complete, optimal, and 100% correct ${language} program that passes ALL public and hidden test cases.
Output ONLY the code, no explanations or comments.
${language === 'Java' ? 'Class name must be: Hello\n' : ''}

PROBLEM: ${problem.title}
${problem.description}

REQUIREMENTS:
1. Prevent Integer Overflow: Use ${language === 'Java' ? 'long' : 'long long'} for all accumulator variables, sums, products, and counters.
2. Optimal Complexity: O(N) or O(N log N) for N <= 10^5 to prevent TLE.
3. Handle all edge cases: N = 0, N = 1, negative numbers, all elements equal, empty strings.
4. Match sample output formatting character-for-character.

\`\`\`${language.toLowerCase()}`;
            }
        }
        // ========== Normal mode: Code Track Mode (Middle Code) ==========
        else if (!prompt && problem.isCodeTrack && hasPrePost && SETTINGS.includePrePostCode) {
            prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer solving a SkillRack code-track problem.
Write ONLY the missing middle ${language} code snippet. No duplicate headers, no duplicate main function.

PROBLEM: ${problem.title}
${problem.description}

RULES:
1. Your code is inserted directly between pre-code and post-code.
2. Use variables and inputs from pre-code, produce outputs/variables required by post-code.
3. Prevent overflow with 64-bit types.

\`\`\`${language.toLowerCase()}`;
        }
        // ========== Normal mode: Standard Full Code Problem ==========
        else if (!prompt) {
            const ioHint = (language === 'C++' || language === 'C++23') ?
                'Enable fast I/O (ios_base::sync_with_stdio(false); cin.tie(NULL);). Use cin >> ws before getline(cin, str).' :
                (language === 'C') ?
                    'Consume newlines after reading numbers using scanf(" %c", &c) or scanf(" %[^\n]", s).' :
                    (language === 'Python') ?
                        'Use sys.stdin.read().split() for robust whitespace-agnostic token parsing.' :
                        (language === 'Java') ?
                            'Class name must be Hello. Consume newline with sc.nextLine() after sc.nextInt().' : '';

            prompt = customSystemPrompt + `You are a Grandmaster Competitive Programmer solving a SkillRack challenge.
TARGET PROGRAMMING LANGUAGE: ${language.toUpperCase()}

CRITICAL LANGUAGE REQUIREMENT:
You MUST write the solution ONLY in ${language.toUpperCase()}.
Do NOT write Python. Do NOT write any other programming language. The server compiler is strictly expecting ${language.toUpperCase()}.

Write a complete, optimal, and robust ${language} program that passes ALL public sample cases and ALL private hidden test cases.
Output ONLY the ${language} code, no explanations or comments.
${language === 'Java' ? 'Class name must be: Hello\n' : ''}

PROBLEM: ${problem.title}
${problem.description}
${ioHint ? '\nI/O GUIDANCE:\n' + ioHint : ''}

CRITICAL RULES FOR PASSING ALL HIDDEN TEST CASES:
1. PREVENT 64-BIT INTEGER OVERFLOW: Use ${language === 'Java' ? 'long' : 'long long'} for all sums, products, counters, coordinates, and intermediate accumulators. Use 1LL for multipliers.
2. OPTIMAL TIME COMPLEXITY: Target O(N) or O(N log N) when N <= 10^5 to prevent Time Limit Exceeded (TLE).
3. HANDLE ALL EDGE CASES: Test N = 1, N = 0, negative values, all elements identical, sorted vs reverse-sorted arrays, single character strings, empty inputs.
4. EXACT OUTPUT MATCH: Output only what is requested with exact spacing and decimal precision.

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
                        return await generateWithGemini(promptText, GRANDMASTER_SYSTEM_PROMPT);
                    case 'openrouter':
                        return await generateWithOpenRouter(promptText, GRANDMASTER_SYSTEM_PROMPT);
                    case 'puter':
                        return await generateWithPuter(promptText, GRANDMASTER_SYSTEM_PROMPT);
                    case 'openai':
                        return await generateWithOpenAI(promptText, GRANDMASTER_SYSTEM_PROMPT);
                    case 'g4f':
                        return await generateWithG4F(promptText);
                    case 'duckduckgo':
                        return await generateWithDuckDuckGo(promptText);
                    case 'yuppbridge':
                        return await generateWithYuppBridge(promptText);
                    case 'nvidia':
                        return await generateWithNvidia(promptText);
                    case 'omniroute':
                        return await generateWithOmniRoute(promptText);
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
                    } else if (problem.blankInputs.length === 1) {
                        answers = [extractCode(response, language)];
                    } else {
                        answers = response.split('\n')
                            .map(l => {
                                let clean = l.trim();
                                clean = clean.replace(/^[-*•#]\s+/, '').replace(/^\d+\.\s*/, '').trim();
                                return clean;
                            })
                            .filter(Boolean);
                    }
                }

                if (Array.isArray(answers) && answers.length > 0) {
                    problem.blankInputs.forEach((input, index) => {
                        const val = answers[index] !== undefined ? String(answers[index]) : '';
                        input.value = val;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`[MFIB] Blank ${index} ← "${val}"`);
                    });
                    console.log('[AutoSolver] MFIB blanks filled successfully');

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

                if (!code || code.trim().length < 5) {
                    notifyPopup('Failed to extract valid code from AI response. Please try again.');
                    return;
                }

                // Check if code is identical to existing code
                let existingCode = '';
                if (window.txtCode && window.txtCode.getSession) {
                    existingCode = window.txtCode.getSession().getValue();
                }

                if (existingCode && calculateCodeSimilarity(code, existingCode) > 0.99) {
                    const lenientRetryPrompt = `${prompt}

[CRITICAL RETRY DIRECTIVE - PREVIOUS CODE FAILED]
The previous answer was identical or failed private hidden test cases.
You MUST provide a fundamentally DIFFERENT and ROBUST implementation:
1. Re-examine the mathematical problem logic: are you checking boundaries in the wrong order?
2. 64-bit integer overflow: Ensure 'long long' / 'long' is used everywhere.
3. Edge cases: Test N=1, N=0, all elements equal, negative numbers, reverse sorted arrays, zeros.
4. Input stream: Ensure all whitespace and multi-line/single-line token differences are handled.
5. Provide a completely working solution with NO comments.`;

                    response = await requestFromProvider(lenientRetryPrompt);
                    code = extractCode(response, language);

                    if (!code || code.trim().length < 5) {
                        notifyPopup('Failed to extract valid code from AI retry response. Please try again.');
                        return;
                    }
                }

                // Check if generated code is in the wrong language
                if (isLanguageMismatch(code, language)) {
                    console.warn(`[AI] Detected language mismatch for ${language}. Re-prompting...`);
                    const langRetryPrompt = `${prompt}

[CRITICAL ERROR - WRONG LANGUAGE GENERATED]
The previous answer was generated in the WRONG programming language (e.g. Python instead of ${language}).
The compiler on this problem strictly evaluates ${language}.
You MUST rewrite the entire solution ONLY in valid ${language}.
${language === 'C' ? 'Include <stdio.h>, <stdlib.h>, and int main(). Do NOT use Python.' : ''}
${language === 'C++' || language === 'C++23' ? 'Include <iostream>, <vector>, and int main(). Do NOT use Python.' : ''}
${language === 'Java' ? 'Use public class Hello with public static void main. Do NOT use Python.' : ''}
Output ONLY the valid ${language} code with NO comments:`;

                    response = await requestFromProvider(langRetryPrompt);
                    code = extractCode(response, language);
                }

                if (code) {
                    const inserted = await insertCodeIntoEditor(code);
                    if (inserted) {
                        console.log(errorInfo.hasError ? 'AI fix applied successfully' : 'AI solution inserted successfully');
                        showToastPill(errorInfo.hasError ? 'AI Fix Applied!' : 'AI Solution Inserted!', 'success', 2500);
                    } else {
                        console.warn('[AI] Could not find suitable editor element to insert code.');
                        showToastPill('Failed to insert code into editor. Please check editor.', 'error', 3000);
                    }
                } else {
                    showToastPill('Failed to extract valid code from AI response.', 'error', 3000);
                }
            }
        } catch (error) {
            console.error('AI generation error:', error);
            notifyPopup('Error: ' + error.message);
        } finally {
            isAiGenerationInProgress = false;
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

            if (resultType === 'hidden_failed' || (resultType === 'failed' && (rawError.toLowerCase().includes('private') || rawError.toLowerCase().includes('hidden')))) {
                return {
                    retryType: 'hidden_test_failed',
                    label: 'hidden test case failure',
                    contextText: rawError || 'Private (Hidden) Test Cases Failed.'
                };
            }

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

                    // Check error elements FIRST to avoid "9 Passed 3 Failed" matching "passed"
                    const errPanelText = ((document.querySelector('#errormsg')?.innerText || '') + ' ' + (document.querySelector('#errormsg_content')?.innerText || '')).toLowerCase();
                    if (errPanelText.includes('private') || errPanelText.includes('hidden') || errPanelText.includes('did not pass') || errPanelText.includes('failed') || (errPanelText.includes('passed') && errPanelText.includes('failed'))) {
                        if (errPanelText.includes('error:') || errPanelText.includes('compilation')) return 'compilation_error';
                        if (errPanelText.includes('segmentation') || errPanelText.includes('runtime')) return 'runtime_error';
                        if (errPanelText.includes('private') || errPanelText.includes('hidden')) return 'hidden_failed';
                        return 'failed';
                    }

                    if (hasText('#errormsg', 'error:') || hasText('#errormsg', 'compilation')) return 'compilation_error';
                    if (hasText('#errormsg', 'segmentation') || hasText('#errormsg', 'runtime')) return 'runtime_error';
                    if (hasText('#errormsg', 'did not pass') || hasText('#errormsg', 'wrong') || hasText('#errormsg', 'execution')) return 'failed';

                    // Standard success elements
                    if (hasText('#successmsg', 'passed') || hasText('.ui-panel-title', 'passed')) return 'success';

                    // PrimeFaces growl messages (fallback when errormsg is absent)
                    const growlItems = document.querySelectorAll('.ui-growl-item-container, .ui-growl-item');
                    for (const g of growlItems) {
                        const gt = (g.innerText || '').toLowerCase();
                        if (gt.includes('error') || gt.includes('fail') || gt.includes('wrong') || gt.includes('private') || gt.includes('hidden')) {
                            if (gt.includes('private') || gt.includes('hidden')) return 'hidden_failed';
                            return 'failed';
                        }
                        if (gt.includes('pass') || gt.includes('success') || gt.includes('correct')) return 'success';
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

                    // ── Auto-save correct solution to vault ──
                    try {
                        if (typeof WASDBridge !== 'undefined' && typeof WASDBridge.vaultAutoSave === 'function') {
                            WASDBridge.vaultAutoSave();
                        }
                    } catch (e) {
                        console.debug('[AutoSolver] vaultAutoSave error (non-fatal):', e);
                    }

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

            updateStatus(`Failed after ${maxRetries} attempts. Moving to next...`, 'warning');
            await sleep(3000);
            checkStop();
            const movedNext = await clickProceedNext();
            if (movedNext) return true;
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
    // ALSO includes Language Pack Scanner (from incomplete-questions-module.js)
    // ============================================
    const FindIncompleteModule = (function () {
        'use strict';

        // ── Language Pack Constants (from incomplete-questions-module.js) ──────
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

        // ── Scan Mode ────────────────────────────────────────────────────────
        const SCAN_MODE = Object.freeze({
            TRACKS: 'tracks',        // Original: scans viewsolved.xhtml for incomplete tracks
            LANG_PACKS: 'langPacks', // JS port: scans language packs via GM_xmlhttpRequest
            BRIDGE_API: 'bridgeApi'  // Python tools via local bridge server
        });
        let currentScanMode = SCAN_MODE.TRACKS;

        // ── Bridge API Config ────────────────────────────────────────────────
        const BRIDGE_API_URL = 'http://localhost:8000';
        const PACK_NAMES = ['C', 'Java', 'Python', 'C++', 'SQL', 'DS-C', 'DS-Java'];

        // ── Auto Solver State ────────────────────────────────────────────────
        let autoSolverEnabled = false;
        let autoSolverQueue = [];
        let autoSolverCurrentIndex = -1;

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
        let visitedPaths = new Set(); // Bug fix: prevents infinite crawl recursion
        let cachedTrackData = null; // Caching: map of Level -> Track -> parts array
        let activeSolvedCounts = null; // Caching: current solved counts for comparison

        // ── Language Pack State ──────────────────────────────────────────────
        let langPackResults = {}; // Results from language pack scanning
        let langPackCacheTimestamp = null;
        let langPackCachedData = null;

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
            queuePromise = nextLink.catch(() => { });
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
            } catch (_) { }
            try {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const el = doc.querySelector('input[name="jakarta.faces.ViewState"]');
                if (el) return el.value;
            } catch (_) { }
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
                } catch (_) { }
                const val = localStorage.getItem(key);
                return val !== null ? val : def;
            },
            setValue(key, value) {
                try {
                    if (typeof GM_getValue !== 'undefined') {
                        GM_setValue(key, value);
                        return;
                    }
                } catch (_) { }
                localStorage.setItem(key, value);
            },
            deleteValue(key) {
                try {
                    if (typeof GM_deleteValue !== 'undefined') {
                        GM_deleteValue(key);
                        return;
                    }
                } catch (_) { }
                localStorage.removeItem(key);
            }
        };

        // ── Language Pack Scanning Logic (uses top-level gmFetch) ──

        function extractViewStateLangPack(html, formId = null) {
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

        async function openPack(packIndex) {
            // Get base page
            let html = await gmFetch(BASE_URL);
            let viewState = extractViewStateLangPack(html, 'pkglistform');

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
            const viewState = extractViewStateLangPack(html, 'pkglistform');

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
            const viewState = extractViewStateLangPack(html, 'codetracks');

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

        async function scanPackForIncomplete(packIndex, statusCallback) {
            statusCallback(`Scanning ${LANGUAGE_PACKS[packIndex].name} pack...`);

            let packHtml = await openPack(packIndex);
            const subChallenges = extractSubChallenges(packHtml);

            statusCallback(`Found ${subChallenges.length} sections in ${LANGUAGE_PACKS[packIndex].name}`);

            const results = {};

            for (let i = 0; i < subChallenges.length; i++) {
                const sub = subChallenges[i];
                statusCallback(`[${i + 1}/${subChallenges.length}] ${sub.name.substring(0, 40)}...`);

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

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

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

        function getCachedTrackIfUnchanged(levelName, trackName, solvedCounts) {
            if (!cachedTrackData || !cachedTrackData[levelName] || !cachedTrackData[levelName][trackName]) return null;
            const parts = cachedTrackData[levelName][trackName];

            // Verify if all parts in cache match fresh solvedCounts
            for (const part of parts) {
                const fresh = matchSolvedInfo(part.partName, solvedCounts);
                if (!fresh) return null; // Not in fresh solved counts, must crawl
                if (fresh.solvedCount !== (part.solvedCount || 0)) return null; // Count changed, must crawl
            }
            return parts;
        }

        // ── Recursive Deep Crawler ───────────────────────────────────────────
        async function crawlPage(url, transition, parentViewState, pathNames, buttonPath, statusCallback) {
            if (activeController && activeController.signal.aborted) throw new Error('Cancelled');

            // Bug fix 1: hard depth limit — prevents runaway recursion on unexpected page shapes
            if (buttonPath.length > 6) {
                console.warn('[FindIncomplete] Max depth exceeded at:', pathNames.join(' > '));
                return [];
            }

            // Bug fix 2: visited-path deduplication — prevents re-entering the same server state
            const pathKey = pathNames.join('\u27F6') + '\xA7' + buttonPath.map(t => t.btnName || t.href || '').join('>');
            if (visitedPaths.has(pathKey)) {
                console.warn('[FindIncomplete] Already visited:', pathKey);
                return [];
            }
            visitedPaths.add(pathKey);

            const currentPathName = pathNames.join(' \u27A1 ');
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

                // Caching check: if trans is a Track (we're at level root), check if we can bypass crawling
                if (buttonPath.length === 0 && activeSolvedCounts) {
                    const levelName = pathNames[0];
                    const cachedTrackParts = getCachedTrackIfUnchanged(levelName, trans.name, activeSolvedCounts);
                    if (cachedTrackParts) {
                        console.log(`[FindIncomplete] Cache HIT for track ${levelName} > ${trans.name}. Skipping crawl.`);
                        results = results.concat(cachedTrackParts);
                        continue;
                    }
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
            if (currentScanMode === SCAN_MODE.LANG_PACKS) {
                return runLanguagePackScan();
            }

            if (currentState === STATE.SCANNING) return;
            setState(STATE.SCANNING);
            visitedPaths.clear(); // Bug fix: reset visited set for each fresh crawl

            showStatus('Fetching solved counts...', '📊');
            renderScanningState();
            updateLoadingMessage('Fetching solved counts...');

            activeController = new AbortController();

            try {
                // Fetch solved counts first to match against cache and avoid crawling unchanged tracks
                const solvedCounts = await getSolvedCounts();
                activeSolvedCounts = solvedCounts;

                // Load existing cache to check if we can skip some tracks
                cachedTrackData = {};
                try {
                    const raw = storage.getValue('find_incomplete_cache_v2');
                    if (raw) {
                        const parts = JSON.parse(raw).parts || [];
                        parts.forEach(p => {
                            if (p.status !== 'ok' || !p.levelName || !p.buttonPath || p.buttonPath.length === 0) return;
                            const trackName = p.buttonPath[0].name;
                            if (!cachedTrackData[p.levelName]) cachedTrackData[p.levelName] = {};
                            if (!cachedTrackData[p.levelName][trackName]) cachedTrackData[p.levelName][trackName] = [];
                            cachedTrackData[p.levelName][trackName].push(p);
                        });
                    }
                } catch (e) {
                    console.warn("Failed to load cached track data:", e);
                }

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
                    renderList(allParts);
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
                activeSolvedCounts = null;
                cachedTrackData = null;
            }
        }

        // ── Bridge API Scan (Python tools via local server) ────────────────────
        async function runBridgeApiScan() {
            if (currentState === STATE.SCANNING) return;
            setState(STATE.SCANNING);

            showStatus('Starting bridge API scan...', '🔌');
            renderScanningState();
            updateLoadingMessage('Connecting to bridge server...');

            activeController = new AbortController();

            try {
                let allIncomplete = {};
                let totalIncomplete = 0;

                // Check bridge server health first
                try {
                    const healthRes = await fetchWithTimeout(`${BRIDGE_API_URL}/health`, { method: 'GET' });
                    const health = JSON.parse(healthRes);
                    if (!health.status || health.status !== 'ok') {
                        throw new Error('Bridge server not healthy');
                    }
                } catch (err) {
                    throw new Error('Bridge server not running. Start it with: python bridge_server.py');
                }

                // Check cookie status
                try {
                    const cookieRes = await fetchWithTimeout(`${BRIDGE_API_URL}/cookie/status`, { method: 'GET' });
                    const cookieStatus = JSON.parse(cookieRes);
                    if (!cookieStatus.has_cookie) {
                        throw new Error('No cookie found in bridge server. Add cookie to tools/cookie.txt');
                    }
                } catch (err) {
                    throw new Error('Cookie check failed: ' + err.message);
                }

                // Enumerate all packs
                for (let packIndex = 0; packIndex <= 6; packIndex++) {
                    const packName = PACK_NAMES[packIndex];
                    updateLoadingMessage(`Enumerating ${packName}...`);
                    showStatus(`Enumerating ${packName}...`, '🔌');

                    try {
                        const enumRes = await fetchWithTimeout(`${BRIDGE_API_URL}/enum`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pack_index: packIndex })
                        });
                        const enumData = JSON.parse(enumRes);

                        if (!enumData.success) {
                            console.warn(`Enum failed for ${packName}:`, enumData.error);
                            continue;
                        }

                        if (enumData.total_problems === 0) {
                            continue;
                        }

                        // Fetch statements for this pack
                        updateLoadingMessage(`Fetching statements for ${packName}...`);
                        showStatus(`Fetching statements for ${packName}...`, '🔌');

                        const fetchRes = await fetchWithTimeout(`${BRIDGE_API_URL}/fetch`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                enum_file: enumData.data ? JSON.stringify(enumData.data) : '',
                                pack_index: packIndex
                            })
                        });
                        const fetchData = JSON.parse(fetchRes);

                        if (!fetchData.success || !fetchData.data) {
                            console.warn(`Fetch failed for ${packName}:`, fetchData.error);
                            continue;
                        }

                        // Process results - extract incomplete problems
                        const statements = fetchData.data;
                        for (const subName in statements) {
                            const parts = statements[subName];
                            for (const partName in parts) {
                                const problems = parts[partName];
                                for (const problem of problems) {
                                    // Only add incomplete problems (not solved)
                                    if (!problem.solved && problem.id) {
                                        if (!allIncomplete[packName]) allIncomplete[packName] = {};
                                        if (!allIncomplete[packName][subName]) allIncomplete[packName][subName] = {};
                                        if (!allIncomplete[packName][subName][partName]) allIncomplete[packName][subName][partName] = [];

                                        allIncomplete[packName][subName][partName].push({
                                            id: problem.id,
                                            name: problem.name || `Problem ${problem.id}`,
                                            row: problem.row || 0
                                        });
                                        totalIncomplete++;
                                    }
                                }
                            }
                        }

                    } catch (err) {
                        console.error(`Failed to scan ${packName}:`, err);
                        await sleep(500);
                    }
                }

                langPackResults = allIncomplete;
                langPackCacheTimestamp = Date.now();
                langPackCachedData = { ...langPackResults };

                // Save to storage
                const bridgeCacheData = {
                    results: langPackResults,
                    timestamp: langPackCacheTimestamp,
                    source: 'bridge'
                };
                storage.setValue('find_incomplete_bridge_cache', JSON.stringify(bridgeCacheData));

                setState(STATE.IDLE);
                showStatus(`Bridge scan complete! Found ${totalIncomplete} incomplete`, '✅');
                setTimeout(hideStatus, 3000);

                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    renderLangPackResults();
                }

            } catch (err) {
                if (err.message === 'Cancelled') {
                    setState(STATE.IDLE);
                    hideStatus();
                    return;
                }
                setState(STATE.ERROR);
                showStatus(`Bridge scan failed: ${err.message}`, '❌');
                renderErrorState(err.message);
                setTimeout(hideStatus, 8000);
            } finally {
                activeController = null;
            }
        }

        // ── Language Pack Scan (from incomplete-questions-module.js) ───────────
        async function runLanguagePackScan() {
            if (currentState === STATE.SCANNING) return;
            setState(STATE.SCANNING);

            showStatus('Starting language pack scan...', '🔍');
            renderScanningState();
            updateLoadingMessage('Initializing language pack scan...');

            activeController = new AbortController();

            try {
                langPackResults = {};

                for (let packIndex = 0; packIndex <= 6; packIndex++) {
                    const packName = LANGUAGE_PACKS[packIndex].name;

                    try {
                        const results = await scanPackForIncomplete(packIndex, (msg) => {
                            showStatus(msg, '🔍');
                            updateLoadingMessage(msg);
                        });

                        let hasIncomplete = false;
                        for (const sub in results) {
                            if (Object.keys(results[sub]).length > 0) {
                                hasIncomplete = true;
                                break;
                            }
                        }

                        if (hasIncomplete) {
                            langPackResults[packName] = results;
                        }

                    } catch (err) {
                        console.error(`Failed to scan ${packName}:`, err);
                        await sleep(1000);
                    }
                }

                langPackCacheTimestamp = Date.now();
                langPackCachedData = { ...langPackResults };

                // Save to storage
                const langPackCacheData = {
                    results: langPackResults,
                    timestamp: langPackCacheTimestamp
                };
                storage.setValue('find_incomplete_langpack_cache', JSON.stringify(langPackCacheData));

                setState(STATE.IDLE);
                showStatus('Language pack scan complete! 🎉', '✅');
                setTimeout(hideStatus, 3000);

                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    renderLangPackResults();
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

        function renderLangPackResults() {
            if (!dropdown) return;
            dropdown.innerHTML = '';

            let totalIncomplete = 0;
            for (const pack in langPackResults) {
                for (const sub in langPackResults[pack]) {
                    for (const part in langPackResults[pack][sub]) {
                        totalIncomplete += langPackResults[pack][sub][part].length;
                    }
                }
            }

            if (totalIncomplete === 0) {
                let html = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 15px;">✓</div>
                        <h4 style="margin: 0 0 10px 0; color: #48bb78;">All Questions Complete!</h4>
                        <p style="color: #666; margin: 0;">No incomplete questions found in language packs.</p>
                    </div>
                `;
                // Still show auto-solver toggle in Bridge API mode even when no incomplete found
                if (currentScanMode === SCAN_MODE.BRIDGE_API) {
                    html += `
                        <div style="margin: 15px 0; padding: 12px; background: rgba(237, 137, 54, 0.1); border: 1px solid rgba(237, 137, 54, 0.3); border-radius: 6px;">
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; color: #e2e8f0;">
                                <input type="checkbox" id="auto-solver-toggle" ${autoSolverEnabled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #ed8936;">
                                <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                                    🤖 Auto Solver
                                    <span id="auto-solver-status" style="font-size: 10px; background: ${autoSolverEnabled ? 'rgba(237,137,54,0.2)' : 'rgba(255,255,255,0.1)'}; color: ${autoSolverEnabled ? '#ed8936' : '#a1a1aa'}; padding: 1px 6px; border-radius: 3px; font-weight: 500;">${autoSolverEnabled ? 'ON' : 'OFF'}</span>
                                </span>
                            </label>
                            <div id="auto-solver-progress" style="margin-top: 8px; display: none;">
                                <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
                                    <span id="auto-solver-current">0</span> / <span id="auto-solver-total">0</span> problems
                                </div>
                                <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                                    <div id="auto-solver-bar" style="width: 0%; height: 100%; background: #ed8936; transition: width 0.3s;"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }
                dropdown.innerHTML = html;

                // Add event listener for auto-solver toggle (Bridge API mode only)
                if (currentScanMode === SCAN_MODE.BRIDGE_API) {
                    const autoSolverToggle = document.getElementById('auto-solver-toggle');
                    if (autoSolverToggle) {
                        autoSolverToggle.addEventListener('change', (e) => {
                            e.stopPropagation();
                            autoSolverEnabled = e.target.checked;
                            const statusEl = document.getElementById('auto-solver-status');
                            const progressEl = document.getElementById('auto-solver-progress');
                            if (statusEl) {
                                statusEl.textContent = autoSolverEnabled ? 'ON' : 'OFF';
                                statusEl.style.background = autoSolverEnabled ? 'rgba(237,137,54,0.2)' : 'rgba(255,255,255,0.1)';
                                statusEl.style.color = autoSolverEnabled ? '#ed8936' : '#a1a1aa';
                            }
                            if (progressEl) {
                                progressEl.style.display = autoSolverEnabled ? 'block' : 'none';
                            }
                            if (autoSolverEnabled && totalIncomplete > 0) {
                                startAutoSolverQueue();
                            }
                        });
                    }
                }
                return;
            }

            let html = `<div style="margin-bottom: 15px; padding: 10px; background: #f0f9ff; border-radius: 6px;">
                <strong>Found ${totalIncomplete} incomplete question${totalIncomplete !== 1 ? 's' : ''} in language packs</strong>
            </div>`;

            for (const packName in langPackResults) {
                const packData = langPackResults[packName];
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

            // Add auto-solver toggle and refresh button
            if (currentScanMode === SCAN_MODE.BRIDGE_API) {
                html += `
                    <div style="margin: 15px 0; padding: 12px; background: rgba(237, 137, 54, 0.1); border: 1px solid rgba(237, 137, 54, 0.3); border-radius: 6px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; color: #e2e8f0;">
                            <input type="checkbox" id="auto-solver-toggle" ${autoSolverEnabled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #ed8936;">
                            <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                                🤖 Auto Solver
                                <span id="auto-solver-status" style="font-size: 10px; background: ${autoSolverEnabled ? 'rgba(237,137,54,0.2)' : 'rgba(255,255,255,0.1)'}; color: ${autoSolverEnabled ? '#ed8936' : '#a1a1aa'}; padding: 1px 6px; border-radius: 3px; font-weight: 500;">${autoSolverEnabled ? 'ON' : 'OFF'}</span>
                            </span>
                        </label>
                        <div id="auto-solver-progress" style="margin-top: 8px; display: none;">
                            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
                                <span id="auto-solver-current">0</span> / <span id="auto-solver-total">0</span> problems
                            </div>
                            <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                                <div id="auto-solver-bar" style="width: 0%; height: 100%; background: #ed8936; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Add refresh button
            html += `
                <div style="text-align: center; padding: 10px 0; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
                    <button id="lang-pack-refresh-btn" style="background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        🔄 Re-scan Language Packs
                    </button>
                </div>
            `;

            dropdown.innerHTML = html;

            // Add event listener for refresh button
            const refreshBtn = document.getElementById('lang-pack-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadAndRenderTracks(true);
                });
            }

            // Add event listener for auto-solver toggle (Bridge API mode only)
            if (currentScanMode === SCAN_MODE.BRIDGE_API) {
                const autoSolverToggle = document.getElementById('auto-solver-toggle');
                if (autoSolverToggle) {
                    autoSolverToggle.addEventListener('change', (e) => {
                        e.stopPropagation();
                        autoSolverEnabled = e.target.checked;
                        const statusEl = document.getElementById('auto-solver-status');
                        const progressEl = document.getElementById('auto-solver-progress');
                        if (statusEl) {
                            statusEl.textContent = autoSolverEnabled ? 'ON' : 'OFF';
                            statusEl.style.background = autoSolverEnabled ? 'rgba(237,137,54,0.2)' : 'rgba(255,255,255,0.1)';
                            statusEl.style.color = autoSolverEnabled ? '#ed8936' : '#a1a1aa';
                        }
                        if (progressEl) {
                            progressEl.style.display = autoSolverEnabled ? 'block' : 'none';
                        }
                        if (autoSolverEnabled && totalIncomplete > 0) {
                            startAutoSolverQueue();
                        }
                    });
                }
            }
        }

        // ── Auto Solver Queue Processing (persisted across page loads) ────────────────
        const AUTO_SOLVER_STORAGE_KEY = 'find_incomplete_auto_solver_queue';
        let originalAutoSolverSetting = false;
        let originalAISolverSetting = false;

        function saveAutoSolverQueue() {
            const data = {
                queue: autoSolverQueue,
                currentIndex: autoSolverCurrentIndex,
                enabled: autoSolverEnabled,
                paused: autoSolverPaused,
                timestamp: Date.now()
            };
            storage.setValue(AUTO_SOLVER_STORAGE_KEY, JSON.stringify(data));
        }

        function loadAutoSolverQueue() {
            try {
                const raw = storage.getValue(AUTO_SOLVER_STORAGE_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    // Only restore if recent (within 1 hour)
                    if (Date.now() - data.timestamp < 3600000) {
                        autoSolverQueue = data.queue || [];
                        autoSolverCurrentIndex = data.currentIndex || 0;
                        autoSolverEnabled = data.enabled || false;
                        autoSolverPaused = Boolean(data.paused);
                        return true;
                    }
                }
            } catch (e) {
                console.warn('Failed to load auto-solver queue:', e);
            }
            return false;
        }

        function clearAutoSolverQueue() {
            storage.setValue(AUTO_SOLVER_STORAGE_KEY, '');
            autoSolverQueue = [];
            autoSolverCurrentIndex = 0;
            autoSolverEnabled = false;
            autoSolverPaused = false;
            // Restore original settings
            if (originalAutoSolverSetting !== undefined) SETTINGS.enableAutoSolver = originalAutoSolverSetting;
            if (originalAISolverSetting !== undefined) SETTINGS.enableAISolver = originalAISolverSetting;
        }

        function enableAutoSolverSettings() {
            // Save original settings
            originalAutoSolverSetting = SETTINGS.enableAutoSolver;
            originalAISolverSetting = SETTINGS.enableAISolver;
            // Enable for auto-solving
            SETTINGS.enableAutoSolver = true;
            SETTINGS.enableAISolver = true;
        }

        function disableAutoSolverSettings() {
            // Restore original settings
            SETTINGS.enableAutoSolver = originalAutoSolverSetting;
            SETTINGS.enableAISolver = originalAISolverSetting;
        }

        async function startAutoSolverQueue() {
            if (!autoSolverEnabled) return;

            // Enable AutoSolver settings for the queue
            enableAutoSolverSettings();

            // Flatten all incomplete problems into a queue
            autoSolverQueue = [];
            for (const packName in langPackResults) {
                for (const subName in langPackResults[packName]) {
                    for (const partName in langPackResults[packName][subName]) {
                        const problems = langPackResults[packName][subName][partName];
                        for (const problem of problems) {
                            autoSolverQueue.push({
                                packName,
                                subName,
                                partName,
                                problemId: problem.id,
                                problemName: problem.name
                            });
                        }
                    }
                }
            }

            autoSolverCurrentIndex = 0;
            autoSolverPaused = false;

            // Save to storage for persistence across page loads
            saveAutoSolverQueue();

            // Update progress UI
            updateAutoSolverProgress();

            if (autoSolverQueue.length === 0) {
                showStatus('No problems to auto-solve', 'ℹ️');
                disableAutoSolverSettings();
                return;
            }

            showStatus(`Auto Solver: Starting ${autoSolverQueue.length} problems...`, '🤖');

            // Navigate to first problem
            await navigateToNextProblem();
        }

        async function processAutoSolverQueue() {
            // This runs on the problem page after AutoSolver completes
            // Check if we're on a problem page and have a pending queue
            if (!autoSolverEnabled || autoSolverCurrentIndex >= autoSolverQueue.length) {
                // All done or not enabled
                if (autoSolverEnabled && autoSolverCurrentIndex >= autoSolverQueue.length) {
                    showStatus('Auto Solver: All problems processed!', '✅');
                    setTimeout(hideStatus, 5000);
                    clearAutoSolverQueue();
                } else if (!autoSolverEnabled) {
                    showStatus('Auto Solver: Stopped by user', '⏹️');
                    setTimeout(hideStatus, 3000);
                    clearAutoSolverQueue();
                }
                return;
            }

            if (autoSolverPaused) {
                showStatus(`Auto Solver: Paused at ${autoSolverQueue[autoSolverCurrentIndex].problemName} (${autoSolverCurrentIndex + 1}/${autoSolverQueue.length})`, '⏸');
                updateAutoSolverProgress();
                return;
            }

            // We're on a problem page, wait for AutoSolver to complete
            showStatus(`Auto Solver: Processing ${autoSolverQueue[autoSolverCurrentIndex].problemName} (${autoSolverCurrentIndex + 1}/${autoSolverQueue.length})`, '🤖');
            updateAutoSolverProgress();
        }

        async function navigateToNextProblem() {
            if (!autoSolverEnabled || autoSolverPaused || autoSolverCurrentIndex >= autoSolverQueue.length) {
                return;
            }

            const item = autoSolverQueue[autoSolverCurrentIndex];
            let problemUrl = item.link || '';
            if (!problemUrl || !problemUrl.startsWith('http')) {
                problemUrl = `${CODENV_URL}?id=${item.problemId}`;
            }

            // Save current state before navigation
            saveAutoSolverQueue();

            showStatus(`Auto Solver: Navigating to ${item.problemName || ('Problem ' + item.problemId)}...`, '🚀');

            // Navigate to the problem page
            window.location.href = problemUrl;
        }

        function updateAutoSolverProgress() {
            const currentEl = document.getElementById('auto-solver-current');
            const totalEl = document.getElementById('auto-solver-total');
            const barEl = document.getElementById('auto-solver-bar');
            const progressEl = document.getElementById('auto-solver-progress');

            if (currentEl) currentEl.textContent = autoSolverCurrentIndex;
            if (totalEl) totalEl.textContent = autoSolverQueue.length;
            if (barEl) {
                const pct = autoSolverQueue.length > 0 ? Math.round((autoSolverCurrentIndex / autoSolverQueue.length) * 100) : 0;
                barEl.style.width = `${pct}%`;
            }
            if (progressEl) progressEl.style.display = autoSolverEnabled && autoSolverQueue.length > 0 ? 'block' : 'none';
        }

        // Check for pending auto-solver queue on page load
        function checkPendingAutoSolverQueue() {
            const hasQueue = loadAutoSolverQueue();
            if (hasQueue && autoSolverEnabled && autoSolverQueue.length > 0) {
                if (autoSolverPaused) {
                    updateAutoSolverProgress();
                    showStatus(`Auto Solver: Paused (${autoSolverCurrentIndex + 1}/${autoSolverQueue.length})`, '⏸');
                    return;
                }

                // Enable AutoSolver settings for the pending queue
                enableAutoSolverSettings();

                // We have a pending queue, check if we're on a problem page
                const isProblemPage = window.location.href.includes('codeprogram.xhtml');
                if (isProblemPage) {
                    updateAutoSolverProgress();
                    showStatus(`Auto Solver: Ready to solve ${autoSolverQueue[autoSolverCurrentIndex].problemName} (${autoSolverCurrentIndex + 1}/${autoSolverQueue.length})`, '🤖');

                    window.addEventListener('beforeunload', () => {
                        autoSolverCurrentIndex++;
                        saveAutoSolverQueue();
                    }, { once: true });
                } else {
                    navigateToNextProblem();
                }
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
                storage.setValue('find_incomplete_cache_v2', JSON.stringify(cacheData));

                if (dropdown && dropdown.style.display === 'block' && dropdown.style.opacity !== '0') {
                    renderList(cachedParts);
                }
            } catch (e) {
                console.warn("Silent solved counts update failed:", e);
            }
        }

        async function loadAndRenderTracks(forceRefresh = false) {
            if (currentState === STATE.SCANNING) {
                renderScanningState();
                if (statusText) updateLoadingMessage(statusText.textContent);
                return;
            }

            // Handle Bridge API mode
            if (currentScanMode === SCAN_MODE.BRIDGE_API) {
                let cache = null;
                if (!forceRefresh) {
                    try {
                        const raw = storage.getValue('find_incomplete_bridge_cache');
                        if (raw) cache = JSON.parse(raw);
                    } catch (e) { console.error('Failed to parse bridge cache:', e); }
                }

                if (forceRefresh || !cache || !cache.results) {
                    await runBridgeApiScan();
                } else {
                    langPackResults = cache.results;
                    langPackCacheTimestamp = cache.timestamp;
                    renderLangPackResults();
                }
                return;
            }

            // Handle Language Pack mode
            if (currentScanMode === SCAN_MODE.LANG_PACKS) {
                let cache = null;
                if (!forceRefresh) {
                    try {
                        const raw = storage.getValue('find_incomplete_langpack_cache');
                        if (raw) cache = JSON.parse(raw);
                    } catch (e) { console.error('Failed to parse langpack cache:', e); }
                }

                // Only use cache if it's from Language Packs mode (not Bridge API)
                if (forceRefresh || !cache || !cache.results || cache.source === 'bridge') {
                    await runLanguagePackScan();
                } else {
                    langPackResults = cache.results;
                    langPackCacheTimestamp = cache.timestamp;
                    renderLangPackResults();
                }
                return;
            }

            // Default: Track mode
            let cache = null;
            if (!forceRefresh) {
                try {
                    const raw = storage.getValue('find_incomplete_cache_v2');
                    if (raw) cache = JSON.parse(raw);
                } catch (e) { console.error('Failed to parse cache:', e); }
            }

            if (forceRefresh || !cache || !cache.parts) {
                await runFullCrawl();
            } else {
                renderList(cache.parts);
                updateSolvedCountsSilently(cache.parts);
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

        // ── Dropdown UI ──────────────────────────────────────────────────────
        let dropdown = null;
        let statusPanel = null;
        let statusText = null;

        function injectStyles() {
            if (document.getElementById('find-incomplete-styles')) return;
            const style = document.createElement('style');
            style.id = 'find-incomplete-styles';
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulseGlow {
                    0%, 100% { box-shadow: 0 0 10px rgba(99, 179, 237, 0.2); }
                    50% { box-shadow: 0 0 18px rgba(99, 179, 237, 0.45); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.02); }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
                .find-inc-item {
                    display: flex;
                    flex-direction: column;
                    padding: 10px 12px;
                    border-radius: 9px;
                    cursor: pointer;
                    margin-bottom: 7px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
                    user-select: none;
                }
                .find-inc-item:hover {
                    background: rgba(99, 179, 237, 0.1) !important;
                    border-color: rgba(99, 179, 237, 0.35) !important;
                    transform: translateY(-1px);
                }
                .find-inc-item:active {
                    transform: translateY(0);
                }
                .find-inc-title {
                    font-weight: 600;
                    font-size: 13.5px;
                    color: #f4f4f5;
                    line-height: 1.35;
                }
                .find-inc-meta {
                    font-size: 11px;
                    color: #a1a1aa;
                    margin-top: 3px;
                    display: flex;
                    justify-content: space-between;
                    overflow-wrap: break-word;
                }
                .api-ctrl-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-family: 'VT323', monospace;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all 0.15s ease;
                    user-select: none;
                    background: rgba(255, 255, 255, 0.06);
                    color: #e4e4e7;
                    border-color: rgba(255, 255, 255, 0.12);
                }
                .api-ctrl-btn:hover {
                    background: rgba(99, 179, 237, 0.2);
                    border-color: rgba(99, 179, 237, 0.4);
                    color: #63b3ed;
                }
                .api-ctrl-btn:disabled, .api-ctrl-btn[disabled] {
                    opacity: 0.32 !important;
                    cursor: not-allowed !important;
                    pointer-events: none !important;
                    transform: none !important;
                }
                .api-btn-start {
                    background: rgba(34, 197, 94, 0.2) !important;
                    border-color: rgba(34, 197, 94, 0.4) !important;
                    color: #4ade80 !important;
                }
                .api-btn-start:hover:not(:disabled) {
                    background: rgba(34, 197, 94, 0.35) !important;
                    color: #86efac !important;
                }
                .api-btn-pause {
                    background: rgba(234, 179, 8, 0.18) !important;
                    border-color: rgba(234, 179, 8, 0.35) !important;
                    color: #facc15 !important;
                }
                .api-btn-pause:hover:not(:disabled) {
                    background: rgba(234, 179, 8, 0.3) !important;
                }
                .api-btn-stop {
                    background: rgba(239, 68, 68, 0.18) !important;
                    border-color: rgba(239, 68, 68, 0.35) !important;
                    color: #f87171 !important;
                }
                .api-btn-stop:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.3) !important;
                }
                .api-btn-icon {
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    font-size: 13px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                }
                .api-btn-close {
                    width: 24px;
                    height: 24px;
                    padding: 0;
                    font-size: 13px;
                    border-radius: 5px;
                }
                .api-btn-close:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.25) !important;
                    border-color: rgba(239, 68, 68, 0.4) !important;
                    color: #f87171 !important;
                }
                #api-dropdown-body::-webkit-scrollbar {
                    width: 6px;
                }
                #api-dropdown-body::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 3px;
                }
                #api-dropdown-body::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 3px;
                }
                #api-dropdown-body::-webkit-scrollbar-thumb:hover {
                    background: rgba(99, 179, 237, 0.4);
                }
            `;
            document.head.appendChild(style);
        }

        function ensureDropdown(parentEl) {
            if (dropdown) return;
            dropdown = document.createElement('div');
            dropdown.id = 'find-incomplete-dropdown';
            dropdown.style.cssText =
                'position:fixed;top:62px;right:24px;z-index:100002;display:none;' +
                'width:430px;max-width:calc(100vw - 32px);max-height:82vh;' +
                'flex-direction:column;overflow:hidden;' +
                'background:rgba(13,16,23,0.97);backdrop-filter:blur(24px);' +
                '-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12);' +
                'border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.85);' +
                "color:#f4f4f5;font-family:'VT323',monospace;font-size:15px;" +
                'transition:opacity 0.2s ease, transform 0.2s ease;opacity:0;transform:translateY(-6px);';

            // Prevent any clicks or mousedowns inside dropdown from bubbling up and closing it
            dropdown.addEventListener('click', (e) => e.stopPropagation());
            dropdown.addEventListener('mousedown', (e) => e.stopPropagation());

            document.body.appendChild(dropdown);
        }

        function showDropdown(btnEl) {
            ensureDropdown(btnEl);
            injectStyles();

            if (btnEl) {
                const rect = btnEl.getBoundingClientRect();
                dropdown.style.top = `${rect.bottom + 8}px`;
                dropdown.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
                dropdown.style.left = 'auto';
            }

            dropdown.style.display = 'flex';
            dropdown.offsetHeight; // trigger reflow
            dropdown.style.opacity = '1';
            dropdown.style.transform = 'translateY(0)';
        }

        function hideDropdown() {
            if (!dropdown) return;
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'translateY(-6px)';
            setTimeout(() => {
                if (dropdown) dropdown.style.display = 'none';
            }, 200);
        }

        // ── Status pill (disabled - progress shown in dropdown) ───────────────
        function ensureStatusPanel() {}
        function showStatus(msg, icon = 'ℹ️') {}
        function hideStatus() {}

        function setState(s) { currentState = s; }

        // ── Menu button ──────────────────────────────────────────────────────
        function injectMenuButton() {
            if (!SETTINGS.enableFindIncomplete) return;
            const menuList = document.querySelector(
                '.ui-toolbar-group-right .ui-menu-list,' +
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
                '<span class="ui-menuitem-text">Incomplete Questions</span>' +
                '</a>';

            const anchor = li.querySelector('a');
            anchor.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (dropdown && dropdown.style.display === 'flex' && dropdown.style.opacity !== '0') {
                    hideDropdown();
                } else {
                    showDropdown(anchor);
                    apiFetchAndRender();
                }
            });

            const lastItem = menuList.lastElementChild;
            menuList.insertBefore(li, lastItem);
        }

        // ── FastAPI Questions (rendered inside #find-incomplete-dropdown) ────
        let apiQuestions = [];
        let apiLastFetch = null; // null | 'ok' | 'loading' | 'error'
        let apiRenderedList = []; // rows currently visible
        let apiScrapeProgress = { percent: 0, task: '', count: 0 };
        let autoSolverPaused = false;

        function apiBaseUrl() {
            return (SETTINGS.fastAPIBaseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '');
        }

        function apiExtractId(q) {
            if (q && q.question_id) return String(q.question_id);
            const link = (q && q.link) || '';
            const idMatch = link.match(/[?&]id=(\d+)/);
            if (idMatch) return idMatch[1];
            const qm = (q && q.question || '').match(/[Ii]d-?(\d+)/);
            return qm ? qm[1] : '';
        }

        function apiEscape(str) {
            return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
        }

        function apiLevelRank(lv) {
            const u = (lv || '').toUpperCase();
            if (u.includes('STARTER')) return 0;
            if (u.includes('VERY')) return 1;
            if (u.includes('EASY')) return 2;
            if (u.includes('AVERAGE')) return 3;
            if (u.includes('COURSE')) return 4;
            if (u.includes('PRIME') || u.includes('HARD')) return 5;
            return 6;
        }

        function apiLevelBadgeColor(lv) {
            const u = (lv || '').toUpperCase();
            if (u.includes('PRIME') || u.includes('HARD')) return { bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.35)' };
            if (u.includes('AVERAGE')) return { bg: 'rgba(234,179,8,0.2)', color: '#facc15', border: 'rgba(234,179,8,0.35)' };
            if (u.includes('EASY') || u.includes('STARTER') || u.includes('VERY')) return { bg: 'rgba(34,197,94,0.2)', color: '#4ade80', border: 'rgba(34,197,94,0.35)' };
            return { bg: 'rgba(99,179,237,0.18)', color: '#63b3ed', border: 'rgba(99,179,237,0.35)' };
        }

        async function apiShowCookieModal() {
            let cookieStatus = { has_cookie: false, cookie_preview: '' };
            try {
                const res = await gmFetch(apiBaseUrl() + '/cookie/status');
                if (res.ok) cookieStatus = await res.json();
            } catch (err) {}

            const autoCookie = await gmGetCookies();
            const savedCookie = storage.getValue('skillrack_custom_cookie', '');
            const activeCookie = savedCookie || autoCookie;

            const hasJsessionid = /JSESSIONID=/i.test(activeCookie);

            const html = `
                <div style="font-family:sans-serif;font-size:12px;line-height:1.5;max-width:540px;color:#e4e4e7;">
                    <div style="font-size:15px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
                        <span>🔑 SkillRack Session Cookie Setup</span>
                    </div>
                    <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <b>Current Status:</b>
                            <span style="font-weight:700;color:${hasJsessionid ? '#4ade80' : '#f87171'}">${hasJsessionid ? '✅ JSESSIONID detected' : '❌ JSESSIONID MISSING'}</span>
                        </div>
                        <div style="font-size:11px;color:#a1a1aa;">
                            Python server: <span style="color:${cookieStatus.has_cookie ? '#4ade80' : '#f59e0b'}">${cookieStatus.has_cookie ? 'Cookie registered' : 'No cookie on server'}</span>
                        </div>
                    </div>

                    <div style="margin-bottom:8px;font-size:11px;color:#a1a1aa;">
                        <b>How to get Cookie:</b> Press <kbd style="background:#27272a;padding:1px 4px;border-radius:3px;">F12</kbd> &rarr; <b>Network</b> &rarr; reload page &rarr; click any SkillRack request &rarr; copy <b>Cookie:</b> from <i>Request Headers</i>.
                    </div>

                    <label style="display:block;margin-bottom:4px;font-weight:600;">Paste full Cookie header below:</label>
                    <textarea id="cookie-input" placeholder="JSESSIONID=...; oam.Flash.RENDERMAP.TOKEN=...; AWSALB=..." style="width:100%;min-height:90px;padding:8px;background:#0d1117;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#e4e4e7;font-family:monospace;font-size:11px;resize:vertical;outline:none;box-sizing:border-box;">${apiEscape(activeCookie)}</textarea>

                    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                        <button id="cookie-cancel" style="padding:6px 12px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#9ca3af;border-radius:6px;cursor:pointer;">Cancel</button>
                        <button id="cookie-save-only" style="padding:6px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#e4e4e7;border-radius:6px;cursor:pointer;">Save Cookie</button>
                        <button id="cookie-save-rescrape" style="padding:6px 16px;background:#22c55e;border:none;color:white;border-radius:6px;cursor:pointer;font-weight:600;">Save & Re-scrape</button>
                    </div>
                </div>
            `;

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:1000010;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `<div style="background:#18181b;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;max-width:560px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.85);">${html}</div>`;
            document.body.appendChild(modal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            modal.querySelector('#cookie-cancel').onclick = () => modal.remove();

            const saveCookieHandler = async (triggerScrape) => {
                const input = modal.querySelector('#cookie-input').value.trim();
                if (!input) { alert('Cookie cannot be empty'); return; }
                if (!/JSESSIONID=/i.test(input)) {
                    if (!confirm('⚠️ No JSESSIONID detected. Cookie may not work. Save anyway?')) return;
                }

                storage.setValue('skillrack_custom_cookie', input);
                modal.remove();
                try {
                    await gmFetch(apiBaseUrl() + '/cookie', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cookie: input })
                    });
                } catch (err) {}
                if (triggerScrape) {
                    apiReScrapeAndRender();
                } else {
                    alert('✅ Cookie saved successfully!');
                }
            };

            modal.querySelector('#cookie-save-only').onclick = () => saveCookieHandler(false);
            modal.querySelector('#cookie-save-rescrape').onclick = () => saveCookieHandler(true);
            modal.querySelector('#cookie-input').focus();
        }

        function apiShowImportExportModal() {
            const currentCount = apiQuestions ? apiQuestions.length : 0;
            const html = `
                <div style="font-family:sans-serif;font-size:12px;line-height:1.5;color:#e4e4e7;">
                    <div style="font-size:15px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
                        <span>📦 Import / Export Incomplete Questions</span>
                    </div>

                    <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
                        <div style="font-weight:600;margin-bottom:6px;">💻 Python Terminal Scrape (Direct JSON):</div>
                        <div style="display:flex;align-items:center;background:#090d13;border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px 10px;gap:8px;">
                            <code id="cli-cmd-text" style="font-family:monospace;font-size:11px;color:#93c5fd;flex:1;overflow-x:auto;white-space:nowrap;user-select:all;">python -m skillrack_scraper.main scrape -o questions.json</code>
                            <button id="cli-cmd-copy" style="padding:4px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e4e4e7;border-radius:4px;cursor:pointer;font-size:10px;white-space:nowrap;">📋 Copy</button>
                        </div>
                        <div style="font-size:10px;color:#a1a1aa;margin-top:4px;">
                            Run this command in your project terminal to generate <code>questions.json</code>, then upload it below.
                        </div>
                    </div>

                    <div style="display:flex;gap:10px;margin-bottom:12px;">
                        <div style="flex:1;">
                            <label style="display:block;margin-bottom:4px;font-weight:600;">📥 Import Questions File:</label>
                            <input type="file" id="import-json-file" accept=".json,application/json" style="display:none;">
                            <button id="import-choose-file-btn" style="width:100%;padding:8px 12px;background:#3b82f6;border:none;color:white;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
                                📁 Choose JSON File
                            </button>
                        </div>
                        <div style="flex:1;">
                            <label style="display:block;margin-bottom:4px;font-weight:600;">📤 Export Loaded Questions:</label>
                            <button id="export-json-btn" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e4e4e7;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;" ${currentCount === 0 ? 'disabled' : ''}>
                                💾 Export (${currentCount})
                            </button>
                        </div>
                    </div>

                    <label style="display:block;margin-bottom:4px;font-weight:600;">Or Paste JSON Data directly:</label>
                    <textarea id="import-json-textarea" placeholder='Paste JSON array [...] or {"questions": [...]}' style="width:100%;min-height:90px;padding:8px;background:#0d1117;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#e4e4e7;font-family:monospace;font-size:11px;resize:vertical;outline:none;box-sizing:border-box;"></textarea>

                    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                        <button id="import-cancel-btn" style="padding:6px 14px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#9ca3af;border-radius:6px;cursor:pointer;">Cancel</button>
                        <button id="import-apply-btn" style="padding:6px 16px;background:#22c55e;border:none;color:white;border-radius:6px;cursor:pointer;font-weight:600;">Import & Display</button>
                    </div>
                </div>
            `;

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:1000010;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `<div style="background:#18181b;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:20px;max-width:580px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.85);">${html}</div>`;
            document.body.appendChild(modal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            const copyBtn = modal.querySelector('#cli-cmd-copy');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText('python -m skillrack_scraper.main scrape -o questions.json').then(() => {
                        copyBtn.textContent = '✅ Copied!';
                        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
                    });
                };
            }

            const fileInput = modal.querySelector('#import-json-file');
            const chooseFileBtn = modal.querySelector('#import-choose-file-btn');
            const textarea = modal.querySelector('#import-json-textarea');
            const cancelBtn = modal.querySelector('#import-cancel-btn');
            const applyBtn = modal.querySelector('#import-apply-btn');
            const exportBtn = modal.querySelector('#export-json-btn');

            chooseFileBtn.onclick = () => fileInput.click();

            fileInput.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    processImportJson(ev.target.result);
                };
                reader.readAsText(file);
            };

            function processImportJson(raw) {
                try {
                    const parsed = JSON.parse(raw);
                    let list = [];
                    if (Array.isArray(parsed)) {
                        list = parsed;
                    } else if (parsed && Array.isArray(parsed.questions)) {
                        list = parsed.questions;
                    } else if (parsed && Array.isArray(parsed.data)) {
                        list = parsed.data;
                    } else {
                        throw new Error('JSON must be an array of questions or an object containing a "questions" array.');
                    }
                    if (list.length === 0) {
                        alert('JSON was valid, but contained 0 questions.');
                    }
                    apiQuestions = list;
                    apiLastFetch = 'ok';
                    storage.setValue('skillrack_cached_questions', JSON.stringify(list));
                    modal.remove();
                    apiRenderIntoDropdown();
                    alert(`✅ Loaded ${list.length} incomplete questions successfully!`);
                } catch (err) {
                    alert('Invalid JSON: ' + err.message);
                }
            }

            applyBtn.onclick = () => {
                const text = textarea.value.trim();
                if (!text) { alert('Please select a JSON file or paste JSON content.'); return; }
                processImportJson(text);
            };

            if (exportBtn) {
                exportBtn.onclick = () => {
                    const jsonStr = JSON.stringify(apiQuestions, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `skillrack_incomplete_questions_${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                };
            }

            cancelBtn.onclick = () => modal.remove();
        }

        // ── Render complete UI into the dropdown ─────────────────────────────
        function apiRenderIntoDropdown() {
            // Preserve user's filters across rebuilds (e.g. after re-scrape)
            const prevSearch = (document.getElementById('api-search-input') || {}).value || '';
            const prevLang = (document.getElementById('api-filter-lang') || {}).value || '';
            const prevLevel = (document.getElementById('api-filter-level') || {}).value || '';
            if (!dropdown) return;
            dropdown.innerHTML = '';

            // ── 1. Header Bar ───────────────────────────────────────────────
            const header = document.createElement('div');
            header.style.cssText =
                'font-weight:700;font-size:15px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);' +
                'display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:rgba(255,255,255,0.02);';

            const title = document.createElement('span');
            title.innerHTML = '⚡ Incomplete Questions';
            title.style.cssText = 'font-size:15px;color:#f4f4f5;font-weight:700;letter-spacing:0.4px;';

            const countBadge = document.createElement('span');
            countBadge.id = 'api-count-badge';
            countBadge.style.cssText =
                'font-size:11px;color:#63b3ed;background:rgba(99,179,237,0.15);' +
                'padding:1px 8px;border-radius:8px;white-space:nowrap;margin-left:4px;';
            countBadge.textContent = '—';

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:6px;';

            const cookieBtn = document.createElement('button');
            cookieBtn.className = 'api-ctrl-btn api-btn-icon';
            cookieBtn.title = 'Set / Paste Cookie override';
            cookieBtn.innerHTML = '🔑';
            cookieBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                apiShowCookieModal();
            });

            const importExportBtn = document.createElement('button');
            importExportBtn.className = 'api-ctrl-btn api-btn-icon';
            importExportBtn.title = 'Import JSON from Python scraper or Export questions';
            importExportBtn.innerHTML = '📦';
            importExportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                apiShowImportExportModal();
            });

            const reScrapeBtn = document.createElement('button');
            reScrapeBtn.className = 'api-ctrl-btn api-btn-icon';
            reScrapeBtn.title = 'Re-scrape latest questions from SkillRack';
            reScrapeBtn.innerHTML = '↻';
            reScrapeBtn.addEventListener('click', (e) => { e.stopPropagation(); apiReScrapeAndRender(); });

            const minBtn = document.createElement('button');
            minBtn.className = 'api-ctrl-btn api-btn-close';
            minBtn.title = 'Minimize to compact pill';
            minBtn.innerHTML = '−';
            minBtn.addEventListener('click', (e) => { e.stopPropagation(); minimizeFindIncomplete(); });

            const closeBtn = document.createElement('button');
            closeBtn.className = 'api-ctrl-btn api-btn-close';
            closeBtn.title = 'Close Panel';
            closeBtn.innerHTML = '✕';
            closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeFindIncomplete(); });

            btnGroup.appendChild(cookieBtn);
            btnGroup.appendChild(importExportBtn);
            btnGroup.appendChild(reScrapeBtn);
            btnGroup.appendChild(minBtn);
            btnGroup.appendChild(closeBtn);

            header.appendChild(title);
            header.appendChild(countBadge);
            header.appendChild(btnGroup);
            dropdown.appendChild(header);

            // ── 2. Active Queue Banner (if queue is in progress) ────────────
            const queueBanner = document.createElement('div');
            queueBanner.id = 'api-queue-banner';
            queueBanner.style.cssText =
                'padding:8px 12px;background:rgba(237,137,54,0.08);border-bottom:1px solid rgba(237,137,54,0.25);' +
                'display:none;flex-direction:column;gap:6px;';
            dropdown.appendChild(queueBanner);

            // ── 3. Queue Action Toolbar (Merged Toggle + Stop + Icon Clear) ──
            const toolRow = document.createElement('div');
            toolRow.style.cssText =
                'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);' +
                'align-items:center;background:rgba(0,0,0,0.2);';

            // Merged Start / Pause / Resume Toggle Button
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'api-queue-toggle-btn';
            toggleBtn.className = 'api-ctrl-btn api-btn-start';
            toggleBtn.style.cssText = 'flex:1;font-weight:700;';
            toggleBtn.innerHTML = '▶ Start all';
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                apiHandleQueueToggle();
            });

            // Stop Button (enabled only when running / queued)
            const stopBtn = document.createElement('button');
            stopBtn.id = 'api-stop-btn';
            stopBtn.className = 'api-ctrl-btn api-btn-stop';
            stopBtn.style.cssText = 'padding:5px 12px;';
            stopBtn.title = 'Stop Auto-Solver queue';
            stopBtn.innerHTML = '⏹ Stop';
            stopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                apiStopQueue();
            });

            // Clear Button (icon-only, enabled only when paused/stopped)
            const clearBtn = document.createElement('button');
            clearBtn.id = 'api-clear-btn';
            clearBtn.className = 'api-ctrl-btn api-btn-icon';
            clearBtn.title = 'Clear queue';
            clearBtn.innerHTML = '🗑';
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                apiClearQueue();
            });

            toolRow.appendChild(toggleBtn);
            toolRow.appendChild(stopBtn);
            toolRow.appendChild(clearBtn);
            dropdown.appendChild(toolRow);

            // ── 4. Search & Filters ─────────────────────────────────────────
            const filterRow = document.createElement('div');
            filterRow.style.cssText =
                'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);' +
                'align-items:center;background:rgba(255,255,255,0.01);flex-wrap:wrap;';

            const searchInput = document.createElement('input');
            searchInput.id = 'api-search-input';
            searchInput.type = 'text';
            searchInput.placeholder = '🔍 Search title, ID, section…';
            searchInput.style.cssText =
                'flex:1;min-width:130px;padding:5px 8px;background:#16181d;border:1px solid rgba(255,255,255,0.12);' +
                "color:#e4e4e7;border-radius:7px;font-family:'VT323',monospace;font-size:13px;outline:none;";
            searchInput.addEventListener('input', apiApplyFiltersAndRedraw);

            const langSel = document.createElement('select');
            langSel.id = 'api-filter-lang';
            langSel.title = 'Filter by language';
            langSel.style.cssText =
                'flex:1;min-width:90px;padding:5px 7px;background:#16181d;border:1px solid rgba(255,255,255,0.12);' +
                "color:#e4e4e7;border-radius:7px;font-family:'VT323',monospace;font-size:13px;cursor:pointer;outline:none;";

            const levelSel = document.createElement('select');
            levelSel.id = 'api-filter-level';
            levelSel.title = 'Filter by level';
            levelSel.style.cssText = langSel.style.cssText;

            // Populate filter options from current data
            const langs = [...new Set(apiQuestions.map(q => q.language).filter(Boolean))].sort();
            langSel.innerHTML = '<option value="">All langs</option>' +
                langs.map(l => `<option value="${apiEscape(l)}">${apiEscape(l)}</option>`).join('');

            const levels = [...new Set(apiQuestions.map(q => q.level).filter(Boolean))]
                .sort((a, b) => apiLevelRank(a) - apiLevelRank(b));
            levelSel.innerHTML = '<option value="">All levels</option>' +
                levels.map(l => `<option value="${apiEscape(l)}">${apiEscape(l)}</option>`).join('');

            langSel.addEventListener('change', apiApplyFiltersAndRedraw);
            levelSel.addEventListener('change', apiApplyFiltersAndRedraw);

            // Restore previously selected filters (survives re-scrape rebuilds)
            if (prevSearch) searchInput.value = prevSearch;
            if (prevLang && [...langSel.options].some(o => o.value === prevLang)) langSel.value = prevLang;
            if (prevLevel && [...levelSel.options].some(o => o.value === prevLevel)) levelSel.value = prevLevel;

            filterRow.appendChild(searchInput);
            filterRow.appendChild(langSel);
            filterRow.appendChild(levelSel);
            dropdown.appendChild(filterRow);

            // ── 5. Question List Body ───────────────────────────────────────
            const body = document.createElement('div');
            body.id = 'api-dropdown-body';
            body.style.cssText = 'max-height:360px;overflow-y:auto;padding:10px 12px;';
            dropdown.appendChild(body);

            apiApplyFiltersAndRedraw();
            apiUpdateToolbarState();
        }

        // ── State Machine Synchronization ──────────────────────────────────
        function apiUpdateToolbarState() {
            loadAutoSolverQueue();
            const isQueueActive = Boolean(autoSolverEnabled && autoSolverQueue.length > 0);
            const isRunning = isQueueActive && !autoSolverPaused;
            const isPaused = isQueueActive && autoSolverPaused;
            const hasQuestions = Boolean(apiRenderedList && apiRenderedList.length > 0 && apiLastFetch === 'ok');

            // 1. Dropdown toggle button
            const toggleBtn = document.getElementById('api-queue-toggle-btn');
            if (toggleBtn) {
                if (isRunning) {
                    toggleBtn.innerHTML = '⏸ Pause';
                    toggleBtn.className = 'api-ctrl-btn api-btn-pause';
                    toggleBtn.disabled = false;
                    toggleBtn.style.flex = '1';
                } else if (isPaused) {
                    toggleBtn.innerHTML = '▶ Resume';
                    toggleBtn.className = 'api-ctrl-btn api-btn-start';
                    toggleBtn.disabled = false;
                    toggleBtn.style.flex = '1';
                } else {
                    const count = (apiRenderedList && apiRenderedList.length) || 0;
                    toggleBtn.innerHTML = `▶ Start all${count > 0 ? ' (' + count + ')' : ''}`;
                    toggleBtn.className = 'api-ctrl-btn api-btn-start';
                    toggleBtn.disabled = !hasQuestions || apiLastFetch !== 'ok';
                    toggleBtn.style.flex = '1';
                }
            }

            // 2. Dropdown stop button (enabled only when queue is running or paused)
            const stopBtn = document.getElementById('api-stop-btn');
            if (stopBtn) {
                stopBtn.disabled = !isQueueActive;
            }

            // 3. Dropdown clear button (icon-only, enabled only when paused or finished)
            const clearBtn = document.getElementById('api-clear-btn');
            if (clearBtn) {
                const canClear = isPaused || (autoSolverQueue.length > 0 && !autoSolverEnabled);
                clearBtn.disabled = !canClear;
            }

            apiUpdateQueueBanner();
            updateFloatingHUD();
        }

        function apiHandleQueueToggle() {
            loadAutoSolverQueue();
            const isQueueActive = Boolean(autoSolverEnabled && autoSolverQueue.length > 0);
            if (isQueueActive) {
                apiTogglePauseQueue();
            } else {
                apiStartQueueFromVisible();
            }
        }

        function apiUpdateQueueBanner() {
            const banner = document.getElementById('api-queue-banner');
            if (!banner) return;

            loadAutoSolverQueue();
            if (autoSolverEnabled && autoSolverQueue.length > 0) {
                banner.style.display = 'flex';
                const total = autoSolverQueue.length;
                const current = Math.min(autoSolverCurrentIndex + 1, total);
                const pct = Math.round((autoSolverCurrentIndex / total) * 100);
                const currentItem = autoSolverQueue[autoSolverCurrentIndex] || {};

                banner.innerHTML = `
                    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${autoSolverPaused ? '#facc15' : '#4ade80'};">
                        <span>${autoSolverPaused ? '⏸ QUEUE PAUSED' : '🚀 AUTO-SOLVING QUEUE'}: ${current} / ${total} (${pct}%)</span>
                        <span>${autoSolverPaused ? 'Paused' : 'Active'}</span>
                    </div>
                    <div style="width:100%;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${autoSolverPaused ? 'linear-gradient(90deg,#eab308,#fde047)' : 'linear-gradient(90deg,#22c55e,#4ade80)'};transition:width 0.3s ease;"></div>
                    </div>
                    <div style="font-size:11px;color:#d4d4d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        Target: ${apiEscape(currentItem.problemName || ('Problem ' + currentItem.problemId))}
                    </div>
                `;
            } else {
                banner.style.display = 'none';
            }
        }

        function apiApplyFiltersAndRedraw() {
            const body = document.getElementById('api-dropdown-body');
            if (!body) return;

            // ── Loading / error / null states ───────────────────────────────
            if (apiLastFetch === 'loading') {
                const pct = Math.max(0, Math.min(100, apiScrapeProgress.percent || 0));
                const task = apiScrapeProgress.task || 'Syncing session & crawling packs…';
                const found = apiScrapeProgress.count || 0;

                // Define crawl stages for step indicator
                const stages = [
                    { key: 'init', label: 'Init', range: [0, 5], color: '#63b3ed' },
                    { key: 'packs', label: 'Packs', range: [5, 25], color: '#3b82f6' },
                    { key: 'levels', label: 'Levels', range: [25, 50], color: '#8b5cf6' },
                    { key: 'subs', label: 'Subs', range: [50, 75], color: '#d946ef' },
                    { key: 'parts', label: 'Parts', range: [75, 90], color: '#f59e0b' },
                    { key: 'problems', label: 'Problems', range: [90, 100], color: '#4ade80' },
                ];

                // Determine current stage
                let currentStageIdx = stages.findIndex(s => pct >= s.range[0] && pct <= s.range[1]);
                if (currentStageIdx === -1) currentStageIdx = stages.length - 1;

                // Estimate time remaining (rough heuristic: ~3-5 min for full crawl)
                const elapsedMs = Date.now() - (window.__scrapeStartTime || Date.now());
                const estimatedTotalMs = 4 * 60 * 1000; // ~4 minutes
                const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
                const remainingMin = Math.ceil(remainingMs / 60000);
                const remainingSec = Math.ceil((remainingMs % 60000) / 1000);
                const eta = pct >= 100 ? 'Complete' : (remainingMin > 0 ? `${remainingMin}m ${remainingSec}s` : `${remainingSec}s`);

                body.innerHTML = `
                    <div style="text-align:center;padding:20px 16px;">
                        <!-- Header with animated icon -->
                        <div style="margin-bottom:16px;">
                            <div style="font-size:32px;margin-bottom:8px;display:inline-block;animation:pulse 1.5s ease-in-out infinite;">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#63b3ed;">
                                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" style="animation:spin 1.5s linear infinite;transform-origin:12px 12px;">
                                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.5s" repeatCount="indefinite"/>
                                    </path>
                                </svg>
                            </div>
                            <div style="font-size:15px;color:#f4f4f5;font-weight:700;margin-bottom:2px;">Scanning SkillRack for Incomplete Questions</div>
                            <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">${apiEscape(task)}</div>
                        </div>

                        <!-- Stage indicator -->
                        <div style="display:flex;gap:4px;justify-content:center;margin-bottom:14px;flex-wrap:wrap;">
                            ${stages.map((s, i) => {
                                const isActive = i === currentStageIdx;
                                const isDone = i < currentStageIdx || (i === currentStageIdx && pct >= s.range[1]);
                                const dotColor = isDone ? s.color : (isActive ? s.color : 'rgba(255,255,255,0.15)');
                                const dotBorder = isActive ? `0 0 0 2px ${s.color}40` : 'none';
                                const labelColor = isDone || isActive ? '#e4e4e7' : '#71717a';
                                return `
                                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;opacity:${isDone || isActive ? '1' : '0.5'};">
                                        <div style="width:14px;height:14px;border-radius:50%;background:${dotColor};border:2px solid ${dotColor};box-shadow:${dotBorder};transition:all 0.3s ease;${isActive ? 'animation:pulse 1s ease-in-out infinite;' : ''}"></div>
                                        <span style="font-size:9px;color:${labelColor};font-weight:${isActive ? '700' : '500'};white-space:nowrap;">${apiEscape(s.label)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <!-- Main progress bar with glow effect -->
                        <div style="width:100%;margin-bottom:10px;">
                            <div style="width:100%;height:10px;background:rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;position:relative;border:1px solid rgba(99,179,237,0.25);">
                                <div style="height:100%;width:${Math.max(3, pct)}%;background:linear-gradient(90deg,#3b82f6,#60a5fa,#8b5cf6,#d946ef,#f59e0b,#4ade80);background-size:200% 100%;border-radius:8px;transition:width 0.4s cubic-bezier(0.4,0,0.2,1);position:relative;"
                                     id="progress-bar-fill">
                                    <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);animation:shimmer 1.5s infinite;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Stats row -->
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:#a1a1aa;padding:0 4px;margin-bottom:8px;">
                            <span>Progress: <b style="color:#e4e4e7;">${pct}%</b></span>
                            <span>Found: <b style="color:#4ade80;">${found}</b> questions</span>
                            <span>ETA: <b style="color:#f59e0b;">${eta}</b></span>
                        </div>

                        <!-- Live log / detail -->
                        <div style="font-size:10px;color:#71717a;background:rgba(255,255,255,0.03);padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);text-align:left;">
                            ${apiEscape(task)}
                        </div>
                    </div>

                    <style>
                        @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                        @keyframes pulse {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.6; transform: scale(1.05); }
                        }
                        @keyframes shimmer {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(200%); }
                        }
                    </style>`;
                return;
            }
            if (apiLastFetch === 'error') {
                body.innerHTML = `
                    <div style="text-align:center;padding:22px 14px;">
                        <div style="font-size:24px;margin-bottom:8px;">⚠️</div>
                        <div style="font-size:13px;color:#f87171;font-weight:600;">FastAPI server not ready or no questions scraped yet</div>
                        <div style="font-size:11px;color:#a1a1aa;margin-top:4px;">Server: <code>${apiEscape(apiBaseUrl())}</code></div>
                        <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
                            <button id="err-set-cookie-btn" style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🔑 Set Cookie</button>
                            <button id="err-import-json-btn" style="padding:6px 12px;background:#22c55e;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">📦 Import JSON File</button>
                            <button id="err-rescrape-btn" style="padding:6px 12px;background:rgba(255,255,255,0.1);color:#e4e4e7;border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:11px;cursor:pointer;">↻ Re-scrape</button>
                        </div>
                    </div>`;
                setTimeout(() => {
                    const ckBtn = body.querySelector('#err-set-cookie-btn');
                    if (ckBtn) ckBtn.onclick = (e) => { e.stopPropagation(); apiShowCookieModal(); };
                    const impBtn = body.querySelector('#err-import-json-btn');
                    if (impBtn) impBtn.onclick = (e) => { e.stopPropagation(); apiShowImportExportModal(); };
                    const retryBtn = body.querySelector('#err-rescrape-btn');
                    if (retryBtn) retryBtn.onclick = (e) => { e.stopPropagation(); apiReScrapeAndRender(); };
                }, 0);
                return;
            }

            // ── Filter and sort ─────────────────────────────────────────────
            const searchVal = (document.getElementById('api-search-input') || {}).value || '';
            const langFilter = (document.getElementById('api-filter-lang') || {}).value || '';
            const levelFilter = (document.getElementById('api-filter-level') || {}).value || '';

            let list = apiQuestions;
            if (searchVal.trim()) {
                const s = searchVal.trim().toLowerCase();
                list = list.filter(q =>
                    (q.question && q.question.toLowerCase().includes(s)) ||
                    (q.section && q.section.toLowerCase().includes(s)) ||
                    (q.problem_set && q.problem_set.toLowerCase().includes(s)) ||
                    (apiExtractId(q) && apiExtractId(q).includes(s))
                );
            }
            if (langFilter) list = list.filter(q => String(q.language || '').toUpperCase().includes(langFilter.toUpperCase()));
            if (levelFilter) list = list.filter(q => String(q.level || '').toUpperCase().includes(levelFilter.toUpperCase()));

            const sorted = [...list].sort((a, b) =>
                (apiLevelRank(a.level) - apiLevelRank(b.level)) ||
                String(a.language || '').localeCompare(String(b.language || '')) ||
                String(a.section || '').localeCompare(String(b.section || '')) ||
                String(a.question || '').localeCompare(String(b.question || ''))
            );
            apiRenderedList = sorted;

            const badge = document.getElementById('api-count-badge');
            if (badge) badge.textContent = sorted.length + ' Incomplete';

            // ── Empty state ─────────────────────────────────────────────────
            if (sorted.length === 0) {
                body.innerHTML = `
                    <div style="text-align:center;padding:28px 14px;">
                        <div style="font-size:24px;margin-bottom:8px;">✅</div>
                        <div style="font-size:13px;color:#e4e4e7;font-weight:600;">No incomplete questions found</div>
                        <div style="font-size:11px;color:#71717a;margin-top:5px;">Try <b>↻</b> in header or clear your search filters.</div>
                    </div>`;
                return;
            }

            // ── Question rows ───────────────────────────────────────────────
            body.innerHTML = sorted.map((q, idx) => {
                const qId = apiExtractId(q);
                const lvlStyle = apiLevelBadgeColor(q.level);
                return `
                <div class="find-inc-item api-q-row" data-idx="${idx}" data-id="${apiEscape(qId)}">
                    <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px;">
                        <span style="font-size:10px;padding:1px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;background:${lvlStyle.bg};color:${lvlStyle.color};border:1px solid ${lvlStyle.border};">${apiEscape(q.level)}</span>
                        <span style="font-size:10px;padding:1px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;background:rgba(99,179,237,0.14);color:#63b3ed;border:1px solid rgba(99,179,237,0.25);">${apiEscape(q.language)}</span>
                        ${qId ? `<span style="font-size:10px;color:#71717a;margin-left:auto;font-family:monospace;">#${apiEscape(qId)}</span>` : ''}
                    </div>
                    <div class="find-inc-title">${apiEscape(q.question)}</div>
                    <div class="find-inc-meta">
                        <span>${apiEscape(q.section)}${q.problem_set ? ' · ' + apiEscape(q.problem_set) : ''}</span>
                        <span style="color:#4ade80;font-weight:600;font-size:11px;">Solve →</span>
                    </div>
                </div>`;
            }).join('');
        }

        async function apiSyncCookieToBackend() {
            // Build a full request-header style cookie string (JSESSIONID=...; oam...; AWSALB=...)
            // GM_cookie.list reads HttpOnly cookies (JSESSIONID) that document.cookie cannot see.
            const mergeCookies = (a, b) => {
                const map = new Map();
                String(a || '').split(';').concat(String(b || '').split(';')).forEach(part => {
                    const eq = part.indexOf('=');
                    if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
                });
                return [...map.entries()].filter(([k, v]) => k && v).map(([k, v]) => `${k}=${v}`).join('; ');
            };

            let cookie = '';
            try {
                cookie = await gmGetCookies();
            } catch (e) {
                console.warn('[FastAPI] gmGetCookies failed:', e);
            }
            // Safety net: union with document.cookie (non-HttpOnly cookies)
            cookie = mergeCookies(cookie, document.cookie);

            let hasSid = /JSESSIONID=/i.test(cookie);

            // Recovery: GM_cookie may be unavailable (grant not applied / manager
            // restriction). Ask SkillRack for a fresh session id via Set-Cookie.
            if (!hasSid) {
                try {
                    const r = await gmFetch('https://www.skillrack.com/faces/candidate/codeprogram.xhtml');
                    const raw = r.responseHeadersRaw || '';
                    const matches = raw.match(/^set-cookie:\s*(JSESSIONID=[^;\r\n]+)/gim) || [];
                    if (matches.length) {
                        const sid = matches[matches.length - 1].replace(/^set-cookie:\s*/i, '').trim();
                        cookie = mergeCookies(cookie, sid);
                        hasSid = true;
                        console.info('[FastAPI] Recovered JSESSIONID from Set-Cookie header');
                    }
                } catch (e) {
                    console.warn('[FastAPI] Set-Cookie recovery fetch failed:', e);
                }
            }

            if (!hasSid) {
                // Do NOT clobber a possibly-good cookie.txt with AWSALB-only junk.
                console.warn('[FastAPI] No JSESSIONID in collected cookies — skipping cookie sync');
                showStatus('No JSESSIONID found — log into SkillRack first', '⚠️');
                setTimeout(hideStatus, 5000);
                return '';
            }

            try {
                const res = await gmFetch(apiBaseUrl() + '/cookie', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cookie: cookie.trim() })
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return cookie.trim();
            } catch (e) {
                console.warn('[FastAPI] Cookie sync note:', e);
                return '';
            }
        }

        async function apiFetchQuestions() {
            apiLastFetch = 'loading';
            apiApplyFiltersAndRedraw();
            apiUpdateToolbarState();
            try {
                // Proactively sync current browser cookie to the Python server first
                await apiSyncCookieToBackend();

                const res = await gmFetch(apiBaseUrl() + '/questions');
                if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (res.statusText || 'request failed'));
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : []);
                apiQuestions = list;
                storage.setValue('skillrack_cached_questions', JSON.stringify(list));
                apiLastFetch = 'ok';
            } catch (err) {
                console.warn('[FastAPI] Failed to fetch questions:', err);
                const cachedRaw = storage.getValue('skillrack_cached_questions', '');
                if (cachedRaw) {
                    try {
                        const parsed = JSON.parse(cachedRaw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            apiQuestions = parsed;
                            apiLastFetch = 'ok';
                            apiRenderIntoDropdown();
                            return;
                        }
                    } catch (_) {}
                }
                apiQuestions = [];
                apiLastFetch = 'error';
            }
            apiRenderIntoDropdown();
        }

        function apiFetchAndRender() {
            ensureDropdown();
            injectStyles();
            if (apiLastFetch === null || apiLastFetch === 'error') {
                apiRenderIntoDropdown();
                apiFetchQuestions();
            } else {
                apiRenderIntoDropdown();
            }
        }

        async function apiReScrapeAndRender() {
            apiLastFetch = 'loading';
            // Set start time for ETA calculation
            window.__scrapeStartTime = Date.now();
            apiScrapeProgress = { percent: 5, task: 'Starting background scraper…', count: 0 };
            apiApplyFiltersAndRedraw();
            apiUpdateToolbarState();

            const countBadge = document.getElementById('api-count-badge');
            if (countBadge) {
                countBadge.textContent = '⏳ Scraping…';
                countBadge.style.color = '#ed8936';
                countBadge.style.background = 'rgba(237,137,54,0.15)';
                // Animate the badge
                countBadge.style.animation = 'pulse 1s ease-in-out infinite';
            }
            showStatus('Scraping SkillRack for incomplete questions…', '⏳');

            try {
                const currentCookie = await gmGetCookies();
                // 1. Launch async scrape job
                const startRes = await gmFetch(apiBaseUrl() + '/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cookie: currentCookie || undefined, force_refresh: true })
                });
                if (!startRes.ok) throw new Error('HTTP ' + startRes.status);
                const startData = await startRes.json();
                const jobId = startData?.job_id;

                if (jobId) {
                    // 2. Poll job status until complete
                    let attempts = 0;
                    while (attempts < 180) {
                        await new Promise(r => setTimeout(r, 600));
                        attempts++;
                        try {
                            const statusRes = await gmFetch(apiBaseUrl() + '/scrape/' + encodeURIComponent(jobId));
                            if (statusRes.ok) {
                                const job = await statusRes.json();
                                apiScrapeProgress = {
                                    percent: job.progress_percent || 0,
                                    task: job.current_task || 'Scanning tracks…',
                                    count: job.questions_found || 0
                                };
                                apiApplyFiltersAndRedraw();

                                // Update count badge with live progress
                                if (countBadge) {
                                    countBadge.textContent = `${job.questions_found || 0} found · ${job.progress_percent || 0}%`;
                                    countBadge.style.color = '#63b3ed';
                                    countBadge.style.background = 'rgba(99,179,237,0.15)';
                                }

                                if (job.status === 'completed') {
                                    break;
                                } else if (job.status === 'failed') {
                                    throw new Error(job.error || 'Scrape job failed');
                                }
                            }
                        } catch (pollErr) {
                            console.warn('[FastAPI] Poll error:', pollErr);
                        }
                    }
                }

                // 3. Fetch completed results
                await apiFetchQuestions();

                if (countBadge) {
                    countBadge.textContent = `${apiQuestions.length} questions`;
                    countBadge.style.color = '#4ade80';
                    countBadge.style.background = 'rgba(34,197,94,0.15)';
                    countBadge.style.animation = 'none';
                }
                showStatus(`Re-scrape complete — ${apiQuestions.length} questions found`, '✅');
                setTimeout(hideStatus, 4000);
            } catch (err) {
                console.warn('[FastAPI] Re-scrape failed:', err);
                apiQuestions = [];
                apiLastFetch = 'error';
                apiRenderIntoDropdown();

                if (countBadge) {
                    countBadge.textContent = 'Error';
                    countBadge.style.color = '#f87171';
                    countBadge.style.background = 'rgba(239,68,68,0.15)';
                }
                showStatus('Re-scrape failed: ' + (err.message || 'Server error'), '❌');
                setTimeout(hideStatus, 5000);
            }
        }

        // ── Floating Queue HUD & Minimized Pill (persistent overlay) ────────
        let floatingHud = null;
        let hudMinimized = (storage.getValue('killcode_hud_minimized') === 'true');
        let dropdownMinimized = false;

        function minimizeFindIncomplete() {
            dropdownMinimized = true;
            hideDropdown();
            updateFloatingHUD();
        }

        function closeFindIncomplete() {
            dropdownMinimized = false;
            hideDropdown();
            if (floatingHud && (!autoSolverEnabled || autoSolverQueue.length === 0)) {
                floatingHud.style.display = 'none';
            }
        }

        function ensureFloatingHUD() {
            if (floatingHud) return floatingHud;
            floatingHud = document.createElement('div');
            floatingHud.id = 'killcode-autosolver-hud';
            floatingHud.style.cssText =
                'position:fixed;bottom:24px;left:24px;z-index:99999;display:none;' +
                'max-width:calc(100vw - 32px);' +
                'background:rgba(13,16,23,0.96);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);' +
                'border:1px solid rgba(99,179,237,0.35);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,0.8);' +
                "color:#f4f4f5;font-family:'VT323',monospace;font-size:14px;overflow:hidden;user-select:none;" +
                'transition:opacity 0.2s ease, transform 0.2s ease;';

            floatingHud.addEventListener('click', (e) => e.stopPropagation());
            floatingHud.addEventListener('mousedown', (e) => e.stopPropagation());

            // Dragging logic
            let isDragging = false;
            let startX, startY, initLeft, initTop;

            floatingHud.addEventListener('mousedown', (e) => {
                const handle = e.target.closest('#hud-drag-handle') || (hudMinimized || dropdownMinimized ? floatingHud : null);
                if (!handle || e.target.closest('button')) return;
                isDragging = true;
                const rect = floatingHud.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initLeft = rect.left;
                initTop = rect.top;

                floatingHud.style.right = 'auto';
                floatingHud.style.bottom = 'auto';
                floatingHud.style.left = `${initLeft}px`;
                floatingHud.style.top = `${initTop}px`;

                const onMouseMove = (ev) => {
                    if (!isDragging) return;
                    const deltaX = ev.clientX - startX;
                    const deltaY = ev.clientY - startY;
                    const maxLeft = Math.max(10, window.innerWidth - floatingHud.offsetWidth - 10);
                    const maxTop = Math.max(10, window.innerHeight - floatingHud.offsetHeight - 10);
                    const newLeft = Math.min(Math.max(10, initLeft + deltaX), maxLeft);
                    const newTop = Math.min(Math.max(10, initTop + deltaY), maxTop);
                    floatingHud.style.left = `${newLeft}px`;
                    floatingHud.style.top = `${newTop}px`;
                };

                const onMouseUp = () => {
                    isDragging = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            document.body.appendChild(floatingHud);
            return floatingHud;
        }

        function updateFloatingHUD() {
            loadAutoSolverQueue();
            const isQueueActive = Boolean(autoSolverEnabled && autoSolverQueue.length > 0);

            // If dropdown is open, hide redundant floating pill
            if (dropdown && dropdown.style.display === 'flex' && dropdown.style.opacity !== '0') {
                if (floatingHud) floatingHud.style.display = 'none';
                return;
            }

            // If no queue and not minimized, hide
            if (!isQueueActive && !dropdownMinimized) {
                if (floatingHud) floatingHud.style.display = 'none';
                return;
            }

            const hud = ensureFloatingHUD();
            hud.style.display = 'block';
            hud.style.opacity = '1';

            if (isQueueActive) {
                const total = autoSolverQueue.length;
                const current = Math.min(autoSolverCurrentIndex + 1, total);
                const pct = Math.round((autoSolverCurrentIndex / total) * 100);
                const currentItem = autoSolverQueue[autoSolverCurrentIndex] || {};
                const cleanTitle = apiEscape(currentItem.problemName || ('Problem #' + (currentItem.problemId || '')));

                // Minimized pill state
                hud.style.width = 'auto';
                hud.style.borderRadius = '24px';
                hud.innerHTML = `
                    <div id="hud-drag-handle" style="display:flex;align-items:center;gap:7px;padding:6px 12px;cursor:pointer;background:rgba(255,255,255,0.03);">
                        <span style="font-size:13px;font-weight:700;color:${autoSolverPaused ? '#facc15' : '#4ade80'};display:flex;align-items:center;gap:4px;">
                            ${autoSolverPaused ? '⏸ PAUSED' : '● 🤖'} ${current}/${total} (${pct}%)
                        </span>
                        <span style="font-size:11px;color:#a1a1aa;margin-left:2px;">↗</span>
                        <button id="hud-pill-close-btn" class="api-ctrl-btn api-btn-close" style="width:18px;height:18px;font-size:9px;margin-left:4px;" title="Close">✕</button>
                    </div>`;

                hud.onclick = (e) => {
                    if (e.target.closest('#hud-pill-close-btn')) {
                        e.stopPropagation();
                        closeFindIncomplete();
                        return;
                    }
                    dropdownMinimized = false;
                    const btn = document.getElementById('find-incomplete-btn');
                    showDropdown(btn);
                    apiFetchAndRender();
                };
            } else {
                // Idle state minimized pill (e.g. "⚡ 14 Incomplete ↗ ✕")
                const count = (apiRenderedList && apiRenderedList.length) || apiQuestions.length || 0;
                hud.style.width = 'auto';
                hud.style.borderRadius = '24px';
                hud.innerHTML = `
                    <div id="hud-drag-handle" style="display:flex;align-items:center;gap:7px;padding:6px 12px;cursor:pointer;background:rgba(255,255,255,0.03);">
                        <span style="font-size:13px;font-weight:700;color:#63b3ed;display:flex;align-items:center;gap:4px;">
                            ⚡ ${count} Incomplete
                        </span>
                        <span style="font-size:11px;color:#a1a1aa;margin-left:2px;">↗</span>
                        <button id="hud-pill-close-btn" class="api-ctrl-btn api-btn-close" style="width:18px;height:18px;font-size:9px;margin-left:4px;" title="Close">✕</button>
                    </div>`;

                hud.onclick = (e) => {
                    if (e.target.closest('#hud-pill-close-btn')) {
                        e.stopPropagation();
                        closeFindIncomplete();
                        return;
                    }
                    dropdownMinimized = false;
                    const btn = document.getElementById('find-incomplete-btn');
                    showDropdown(btn);
                    apiFetchAndRender();
                };
            }
        }

        // ── Queue Controls: Start / Pause / Stop / Clear ─────────────────────
        function apiStartQueueFromVisible() {
            if (!apiRenderedList || apiRenderedList.length === 0) {
                showStatus('No questions in current filter', '⚠️');
                setTimeout(hideStatus, 3000);
                return;
            }

            enableAutoSolverSettings();
            autoSolverQueue = apiRenderedList.map(q => {
                const problemId = apiExtractId(q);
                return {
                    problemId,
                    problemName: q.question || q.link || ('Problem ' + (problemId || '')),
                    link: q.link || '',
                    packName: q.language || '',
                    subName: q.section || '',
                    partName: q.problem_set || ''
                };
            }).filter(item => Boolean(item.problemId || item.link));

            autoSolverCurrentIndex = 0;
            autoSolverEnabled = true;
            autoSolverPaused = false;
            dropdownMinimized = true;
            saveAutoSolverQueue();
            apiUpdateToolbarState();

            showStatus(`Auto-Solver: Starting queue (${autoSolverQueue.length} questions)…`, '🚀');
            hideDropdown();
            navigateToNextProblem();
        }

        function apiTogglePauseQueue() {
            autoSolverPaused = !autoSolverPaused;
            saveAutoSolverQueue();
            apiUpdateToolbarState();
            showStatus(autoSolverPaused ? 'Auto-Solver paused' : 'Auto-Solver resumed', autoSolverPaused ? '⏸' : '▶');
            setTimeout(hideStatus, 3000);
        }

        function apiStopQueue() {
            autoSolverEnabled = false;
            autoSolverPaused = false;
            saveAutoSolverQueue();
            apiUpdateToolbarState();
            showStatus('Auto-Solver stopped', '⏹');
            setTimeout(hideStatus, 3000);
        }

        function apiClearQueue() {
            clearAutoSolverQueue();
            autoSolverPaused = false;
            apiUpdateToolbarState();
            showStatus('Queue cleared', '🗑');
            setTimeout(hideStatus, 3000);
        }

        async function apiSolveQuestion(q) {
            if (!q) return;
            let problemId = apiExtractId(q);
            if (!problemId || !/^\d+$/.test(String(problemId))) {
                showStatus('Invalid problem ID for this question', '⚠️');
                setTimeout(hideStatus, 4000);
                return;
            }

            autoSolverQueue = [{
                problemId,
                problemName: q.question || q.link || ('Problem ' + problemId),
                packName: q.language || '',
                subName: (q.section || ''),
                partName: (q.problem_set || '')
            }];
            autoSolverCurrentIndex = 0;
            autoSolverEnabled = true;
            autoSolverPaused = false;
            dropdownMinimized = true;
            enableAutoSolverSettings();
            saveAutoSolverQueue();
            apiUpdateToolbarState();

            hideDropdown();
            showStatus(`Navigating to ${autoSolverQueue[0].problemName}…`, '🚀');
            try {
                await navigateToNextProblem();
            } catch (err) {
                console.warn('[FastAPI] Navigation failed:', err);
                showStatus('Navigation failed: ' + err.message, '❌');
                setTimeout(hideStatus, 5000);
            }
            setTimeout(hideStatus, 1500);
        }

        function initFastAPIQuestionsPanel() {
            if (!SETTINGS.enableFastAPIQuestions) return;
            if (!window.location.hostname.includes('skillrack.com')) return;

            // Delegate clicks on question rows inside the dropdown to the auto-solve flow.
            document.addEventListener('click', (e) => {
                const row = e.target.closest('.api-q-row');
                if (!row) return;
                if (!dropdown || !dropdown.contains(row)) return;
                const rows = [...dropdown.querySelectorAll('.api-q-row')];
                const idx = rows.indexOf(row);
                const q = apiRenderedList[idx];
                if (q) apiSolveQuestion(q);
            });

            // Edge case: Escape closes/minimizes the panel instead of leaving it stuck open.
            // If a solve queue is running, minimize to HUD rather than fully hiding it.
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                if (!dropdown || dropdown.style.display === 'none' || dropdown.style.opacity === '0') return;
                if (autoSolverEnabled && autoSolverQueue.length > 0) {
                    dropdownMinimized = true;
                }
                hideDropdown();
                updateFloatingHUD();
            });
        }

        function init() {
            initFastAPIQuestionsPanel();
            if (!SETTINGS.enableFindIncomplete) return;
            injectMenuButton();

            // Check for pending auto-solver queue on page load & show persistent HUD if active
            checkPendingAutoSolverQueue();
            updateFloatingHUD();

            const obs = new MutationObserver(() => {
                if (!document.getElementById('find-incomplete-btn')) injectMenuButton();
            });
            if (document.body) obs.observe(document.body, { childList: true, subtree: true });

            // Auto-minimize Find Incomplete dropdown on outside click/touch (collapses into compact pill badge)
            document.addEventListener('click', (e) => {
                if (!dropdown || dropdown.style.display === 'none' || dropdown.style.opacity === '0') return;

                // If click is inside dropdown or on trigger button or on HUD pill, do not minimize
                if (dropdown.contains(e.target) || (e.composedPath && e.composedPath().includes(dropdown))) return;
                if (e.target.id === 'find-incomplete-btn' || e.target.closest('#find-incomplete-btn')) return;
                if (floatingHud && (floatingHud.contains(e.target) || (e.composedPath && e.composedPath().includes(floatingHud)))) return;

                // Minimize to compact pill badge on outside click!
                minimizeFindIncomplete();
            });
        }

        return {
            init,
            loadAndRenderTracks,
            getState: () => currentState,
            updateHUD: updateFloatingHUD,
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

    // ============================================
    // 13. WASD HOTKEY CONTROL LAYER
    // W = Invisible Toggle (opacity 0 <-> 1, clicks/functionality intact, persistent)
    // A = Find Incomplete / Unsolved Questions (FindIncompleteModule)
    // S = Kill Switch Toggle (Stop <-> Re-arm, persistent)
    // D = Trigger AI Solution (generateAISolution)
    // ============================================
    const WASDBridge = (function () {
        'use strict';

        const STORAGE_KEY_GHOST = 'killcode_wasd_ghosted';
        const STORAGE_KEY_STOPPED = 'killcode_wasd_stopped';
        const TRANSITION_MS = 260;

        // ── State (single source of truth with persistence) ───────────────────
        const state = {
            running: true,       // loaded from localStorage
            ghosted: false,      // loaded from localStorage
            transitioning: false // debounce flag — prevents mid-transition re-entry
        };

        function loadSavedState() {
            try {
                const savedGhost = localStorage.getItem(STORAGE_KEY_GHOST) === 'true';
                const savedStopped = localStorage.getItem(STORAGE_KEY_STOPPED) === 'true' || localStorage.getItem('autosolver_stopped') === 'true';
                state.ghosted = savedGhost;
                state.running = !savedStopped;
                if (savedStopped) {
                    window.__kcStopped = true;
                }
            } catch (e) {
                console.debug('[WASD] Error loading saved state:', e);
            }
        }

        function saveGhostState(ghosted) {
            try {
                if (ghosted) localStorage.setItem(STORAGE_KEY_GHOST, 'true');
                else localStorage.removeItem(STORAGE_KEY_GHOST);
            } catch (_) {}
        }

        function saveRunningState(running) {
            try {
                if (!running) {
                    localStorage.setItem(STORAGE_KEY_STOPPED, 'true');
                    localStorage.setItem('autosolver_stopped', 'true');
                } else {
                    localStorage.removeItem(STORAGE_KEY_STOPPED);
                    localStorage.removeItem('autosolver_stopped');
                }
            } catch (_) {}
        }

        // ── Zero-Flicker Global Ghost Stylesheet ───────────────────────────────
        function applyGhostStylesheet(enable) {
            let tag = document.getElementById('kc-ghost-active-style');
            if (enable) {
                if (!tag) {
                    tag = document.createElement('style');
                    tag.id = 'kc-ghost-active-style';
                    (document.head || document.documentElement).appendChild(tag);
                }
                tag.textContent = `
                    #bypass-settings-panel,
                    #find-incomplete-status,
                    #find-incomplete-dropdown,
                    #ai-solution-btn,
                    #find-incomplete-btn,
                    #auto-solver-stop,
                    div[id^="auto-solver"],
                    button[title="Bypass Settings"] {
                        opacity: 0 !important;
                        pointer-events: auto !important;
                        transition: opacity ${TRANSITION_MS}ms ease !important;
                    }
                `;
            } else {
                if (tag) tag.remove();
            }
        }

        // ── CSS injection ─────────────────────────────────────────────────────
        function injectStyles() {
            if (document.getElementById('kc-wasd-styles')) return;
            const style = document.createElement('style');
            style.id = 'kc-wasd-styles';
            style.textContent = `
                .kc-ghost-target {
                    opacity: 0 !important;
                    pointer-events: auto !important;
                    transition: opacity ${TRANSITION_MS}ms ease !important;
                }
                .kc-ghost-reveal {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                    transition: opacity ${TRANSITION_MS}ms ease !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        // ── Ghost target selectors ────────────────────────────────────────────
        const STATIC_GHOST_SELECTORS = [
            '#bypass-settings-panel',
            '#find-incomplete-status',
            '#find-incomplete-dropdown',
            '#ai-solution-btn',
            '#find-incomplete-btn'
        ];

        // Dynamic element refs
        let _settingsBtnRef = null;
        let _statusBarRef = null;

        function getGhostTargets() {
            const seen = new Set();
            const targets = [];

            const add = (el) => {
                // Guard: reject null and detached DOM nodes
                if (el && !seen.has(el) && document.contains(el)) {
                    seen.add(el);
                    targets.push(el);
                }
            };

            for (const sel of STATIC_GHOST_SELECTORS) {
                add(document.querySelector(sel));
            }
            add(_settingsBtnRef);
            add(_statusBarRef);

            // AutoSolver status bar container
            const stopBtn = document.getElementById('auto-solver-stop');
            if (stopBtn) add(stopBtn.parentElement);

            return targets;
        }

        // ── W — Invisible Mode Toggle (Persistent) ────────────────────────────
        // 1st press: opacity 0 (clicks remain active, saved to storage)
        // 2nd press: opacity 1
        function doGhostToggle() {
            if (state.transitioning) return;
            state.transitioning = true;

            const targets = getGhostTargets();

            if (!state.ghosted) {
                // Turn invisible
                state.ghosted = true;
                saveGhostState(true);
                applyGhostStylesheet(true);

                targets.forEach(el => {
                    el.classList.remove('kc-ghost-reveal');
                    el.classList.add('kc-ghost-target');
                });
                console.debug('[WASD] W → Invisible Mode ON (saved to storage, clicks preserved)');
            } else {
                // Turn visible
                state.ghosted = false;
                saveGhostState(false);
                applyGhostStylesheet(false);

                targets.forEach(el => {
                    el.classList.remove('kc-ghost-target');
                    el.classList.add('kc-ghost-reveal');
                });
                console.debug('[WASD] W → Visible Mode ON (saved to storage, opacity: 1 restored)');
                setTimeout(() => {
                    targets.forEach(el => el.classList.remove('kc-ghost-reveal'));
                }, TRANSITION_MS + 20);
            }

            setTimeout(() => { state.transitioning = false; }, TRANSITION_MS + 20);
        }

        // ── A — Find Incomplete / Unsolved Questions ──────────────────────────
        function doFindIncomplete() {
            try {
                // 1. If FindIncompleteModule has loadAndRenderTracks, trigger scan
                if (typeof FindIncompleteModule !== 'undefined') {
                    const incBtn = document.getElementById('find-incomplete-btn');
                    if (incBtn) {
                        incBtn.click();
                    } else if (typeof FindIncompleteModule.loadAndRenderTracks === 'function') {
                        FindIncompleteModule.loadAndRenderTracks(true);
                    }
                    console.debug('[WASD] A → Triggered Find Incomplete Questions Scan');
                    return;
                }
            } catch (e) {
                console.debug('[WASD] A → FindIncompleteModule trigger error:', e);
            }

            // Fallback: click find-incomplete-btn if present
            const fallbackBtn = document.getElementById('find-incomplete-btn');
            if (fallbackBtn) {
                fallbackBtn.click();
                console.debug('[WASD] A → Clicked #find-incomplete-btn');
            }
        }

        // ── S — Toggle Kill Switch (Persistent) ───────────────────────────────
        // 1st press: stops all automation and cleans up UI states
        // 2nd press: re-arms everything cleanly
        function doStop() {
            if (state.running) {
                // ── STOP path ──────────────────────────────────────────────
                state.running = false;
                window.__kcStopped = true;
                saveRunningState(false);

                // 1. Stop AutoSolver
                try {
                    if (typeof AutoSolver !== 'undefined' && typeof AutoSolver.stop === 'function') {
                        AutoSolver.stop();
                        console.debug('[WASD] S → AutoSolver.stop() — shouldStop set, AbortController aborted');
                    }
                } catch (e) {
                    console.debug('[WASD] S → AutoSolver.stop() threw (non-fatal):', e);
                }

                // 2. Cancel FindIncompleteModule
                try {
                    if (typeof FindIncompleteModule !== 'undefined' && typeof FindIncompleteModule.cancel === 'function') {
                        FindIncompleteModule.cancel();
                        console.debug('[WASD] S → FindIncompleteModule.cancel() called');
                    }
                } catch (e) {
                    console.debug('[WASD] S → FindIncompleteModule.cancel() threw (non-fatal):', e);
                }

                // 3. UI Cleanup: Reset AI Solution button if stuck in loading/generating state
                const aiBtn = document.getElementById('ai-solution-btn');
                if (aiBtn) {
                    aiBtn.disabled = false;
                    try {
                        if (typeof getAiButtonMarkup === 'function') {
                            aiBtn.innerHTML = getAiButtonMarkup('AI Solution');
                        }
                    } catch (_) {}
                    aiBtn.style.opacity = '1';
                }

                // 4. UI Cleanup: Close any open dropdowns/panels
                const settingsPanel = document.getElementById('bypass-settings-panel');
                if (settingsPanel && settingsPanel.style.display !== 'none') {
                    settingsPanel.style.display = 'none';
                }
                const incDropdown = document.getElementById('find-incomplete-dropdown');
                if (incDropdown && incDropdown.style.display !== 'none') {
                    incDropdown.style.display = 'none';
                }

                // 5. Ghost State Preservation
                if (state.ghosted) {
                    applyGhostStylesheet(true);
                    getGhostTargets().forEach(el => {
                        el.classList.remove('kc-ghost-reveal');
                        el.classList.add('kc-ghost-target');
                    });
                }

                console.debug('[WASD] S → ■ STOPPED — saved to storage, all automation cancelled');

            } else {
                // ── RE-ARM path ────────────────────────────────────────────
                state.running = true;
                window.__kcStopped = false;
                saveRunningState(true);

                // Resume AutoSolver
                try {
                    if (typeof AutoSolver !== 'undefined' && typeof AutoSolver.resume === 'function') {
                        AutoSolver.resume();
                        console.debug('[WASD] S → AutoSolver.resume() — re-armed');
                    }
                } catch (e) {
                    console.debug('[WASD] S → AutoSolver.resume() threw (non-fatal):', e);
                }

                // If ghost mode is active, maintain invisibility on re-arm
                if (state.ghosted) {
                    applyGhostStylesheet(true);
                    getGhostTargets().forEach(el => {
                        el.classList.remove('kc-ghost-reveal');
                        el.classList.add('kc-ghost-target');
                    });
                }

                console.debug('[WASD] S → ● RUNNING — saved to storage, automation re-armed');
            }
        }

        // ── D — Trigger AI Solution ───────────────────────────────────────────
        function doAISolve() {
            try {
                if (typeof generateAISolution === 'function') {
                    generateAISolution();
                    console.debug('[WASD] D → generateAISolution() triggered directly');
                    return;
                }
            } catch (e) {
                console.debug('[WASD] D → generateAISolution threw (non-fatal):', e);
            }

            // Fallback: click AI Solution button
            const aiBtn = document.getElementById('ai-solution-btn');
            if (aiBtn) {
                aiBtn.click();
                console.debug('[WASD] D → Clicked #ai-solution-btn');
            } else {
                console.warn('[WASD] D → No AI Solution button found on page');
            }
        }


        // ── E — Solutions Vault (Save & Share correct solutions) ──────────────
        const VAULT_STORAGE_KEY = 'killcode_solutions_vault';

        function vaultLoad() {
            try {
                const raw = localStorage.getItem(VAULT_STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (_) { return []; }
        }

        function vaultSave(entries) {
            try {
                localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(entries));
            } catch (_) {}
        }

        function getCurrentCode() {
            if (typeof getEditor === 'function') {
                const ed = getEditor();
                if (ed && typeof ed.getSession === 'function') return ed.getSession().getValue();
                if (ed && 'value' in ed) return ed.value;
            }
            const ta = document.getElementById('txtCode');
            if (ta) return ta.value;
            return '';
        }

        function getCurrentProblemTitle() {
            if (typeof getProblemDescription === 'function') {
                try {
                    const p = getProblemDescription();
                    if (p && p.title) return p.title;
                } catch (_) {}
            }
            // fallback: first .ui.label text that isn't a tag
            const labels = document.querySelectorAll('.ui.label');
            for (const l of labels) {
                const t = l.textContent.trim();
                if (t && !l.classList.contains('ribbon') && !l.classList.contains('circular')
                    && !t.includes('Max Execution') && !t.includes('ProgramID')) {
                    return t;
                }
            }
            return document.title || 'Unknown Problem';
        }

        function formatVaultEntryAsText(entry) {
            const sep = '─'.repeat(60);
            return [
                `📌 ${entry.title}`,
                `🔗 ${entry.url}`,
                `🕐 ${new Date(entry.ts).toLocaleString()}`,
                sep,
                entry.code,
                sep
            ].join('\n');
        }

        // ── Auto-save current code to vault (used on successful submission) ──
        function vaultAutoSave() {
            try {
                const code = getCurrentCode().trim();
                const title = getCurrentProblemTitle().trim();

                if (!code) {
                    console.debug('[Vault] No code in editor to auto-save');
                    return false;
                }

                // Detect language
                let lang = 'Unknown';
                try { if (typeof getSelectedLanguage === 'function') lang = getSelectedLanguage(); } catch (_) {}

                const entries = vaultLoad();

                // Check duplicate (same title + same code)
                const isDup = entries.some(en => en.title === title && en.code === code);
                if (isDup) {
                    console.debug('[Vault] Already saved (identical code + title) — skipping auto-save');
                    return false;
                }

                const entry = {
                    id: Date.now() + Math.random().toString(36).slice(2),
                    title,
                    lang,
                    url: window.location.href,
                    code,
                    ts: Date.now()
                };

                entries.unshift(entry);  // newest first
                vaultSave(entries);
                console.log(`[Vault] ✅ Auto-saved correct solution: ${title.slice(0, 50)}`);
                showToastPill(`💾 Correct solution saved: ${title.slice(0, 40)}`, 'success', 2500);
                return true;
            } catch (e) {
                console.warn('[Vault] Auto-save error:', e);
                return false;
            }
        }

        function doVault() {
            // If vault panel already open → close it
            const existing = document.getElementById('kc-vault-panel');
            if (existing) { existing.remove(); return; }

            // Build panel
            const panel = document.createElement('div');
            panel.id = 'kc-vault-panel';
            panel.style.cssText = [
                'position:fixed', 'top:50%', 'left:50%',
                'transform:translate(-50%,-50%)',
                'z-index:1000020',
                'width:min(820px,94vw)', 'max-height:88vh',
                'display:flex', 'flex-direction:column',
                'background:rgba(13,16,23,0.98)',
                'backdrop-filter:blur(24px)', '-webkit-backdrop-filter:blur(24px)',
                'border:1px solid rgba(99,179,237,0.4)',
                'border-radius:16px',
                'box-shadow:0 32px 80px rgba(0,0,0,0.9)',
                "font-family:'VT323',monospace",
                'color:#f4f4f5',
                'overflow:hidden'
            ].join(';');

            // Prevent clicks inside from bubbling and closing
            panel.addEventListener('click', e => e.stopPropagation());
            panel.addEventListener('mousedown', e => e.stopPropagation());
            panel.addEventListener('keydown', e => e.stopPropagation());

            // ── Header ──
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);flex-shrink:0;';
            header.innerHTML = `
                <span style="font-size:20px;">⚡</span>
                <span style="font-size:18px;font-weight:700;color:#f4f4f5;letter-spacing:.4px;">Solutions Vault</span>
                <span id="kc-vault-count" style="font-size:12px;color:#63b3ed;background:rgba(99,179,237,0.15);padding:2px 10px;border-radius:8px;margin-left:4px;">0 saved</span>
                <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
                    <button id="kc-vault-save-btn" title="Save current code + question" style="
                        padding:6px 14px;border:none;border-radius:8px;
                        background:linear-gradient(135deg,#22c55e,#16a34a);
                        color:#fff;font-weight:700;cursor:pointer;font-size:14px;
                        font-family:'VT323',monospace;
                        box-shadow:0 4px 14px rgba(34,197,94,0.4);
                        transition:transform .15s,box-shadow .15s;
                    ">💾 Save Current</button>
                    <button id="kc-vault-export-btn" title="Export all as text" style="
                        padding:6px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;
                        background:rgba(255,255,255,0.06);color:#e4e4e7;
                        cursor:pointer;font-size:14px;font-family:'VT323',monospace;
                        transition:background .15s;
                    ">📤 Export All</button>
                    <button id="kc-vault-clear-btn" title="Delete all saved solutions" style="
                        padding:6px 14px;border:1px solid rgba(239,68,68,0.3);border-radius:8px;
                        background:rgba(239,68,68,0.1);color:#f87171;
                        cursor:pointer;font-size:14px;font-family:'VT323',monospace;
                        transition:background .15s;
                    ">🗑 Clear All</button>
                    <button id="kc-vault-close-btn" title="Close (E)" style="
                        width:28px;height:28px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;
                        background:rgba(255,255,255,0.06);color:#a1a1aa;
                        cursor:pointer;font-size:15px;font-family:'VT323',monospace;
                        transition:background .15s;
                    ">✕</button>
                </div>
            `;
            panel.appendChild(header);

            // ── Search bar ──
            const searchBar = document.createElement('div');
            searchBar.style.cssText = 'padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;background:rgba(0,0,0,0.2);';
            searchBar.innerHTML = `
                <input id="kc-vault-search" type="text" placeholder="🔍  Search by title…" style="
                    width:100%;padding:8px 12px;box-sizing:border-box;
                    background:#16181d;border:1px solid rgba(255,255,255,0.12);
                    border-radius:8px;color:#e4e4e7;font-size:15px;outline:none;
                    font-family:'VT323',monospace;
                ">`;
            panel.appendChild(searchBar);

            // ── Body: split list + detail ──
            const body = document.createElement('div');
            body.style.cssText = 'display:flex;flex:1;overflow:hidden;min-height:0;';

            // left list
            const listPane = document.createElement('div');
            listPane.id = 'kc-vault-list';
            listPane.style.cssText = 'width:270px;flex-shrink:0;overflow-y:auto;border-right:1px solid rgba(255,255,255,0.07);padding:8px 6px;';

            // right detail
            const detailPane = document.createElement('div');
            detailPane.id = 'kc-vault-detail';
            detailPane.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;padding:16px 18px;min-width:0;';
            detailPane.innerHTML = `<div style="color:#555;font-size:15px;margin:auto;text-align:center;">← Select an entry to view &amp; copy</div>`;

            body.appendChild(listPane);
            body.appendChild(detailPane);
            panel.appendChild(body);

            document.body.appendChild(panel);

            // ── State ──
            let entries = vaultLoad();
            let selectedIdx = -1;

            // ── Render helpers ──
            const renderCount = () => {
                const badge = document.getElementById('kc-vault-count');
                if (badge) badge.textContent = `${entries.length} saved`;
            };

            const renderList = (filter = '') => {
                const fl = filter.toLowerCase().trim();
                listPane.innerHTML = '';
                const filtered = entries
                    .map((e, i) => ({ ...e, _origIdx: i }))
                    .filter(e => !fl || e.title.toLowerCase().includes(fl));

                if (filtered.length === 0) {
                    listPane.innerHTML = `<div style="color:#555;font-size:14px;padding:20px 10px;text-align:center;">${fl ? 'No matches' : 'Nothing saved yet.<br><br>Press <b style="color:#63b3ed">💾 Save Current</b> to store the solution for this problem.'}</div>`;
                    return;
                }

                filtered.forEach(({ title, ts, lang, _origIdx }) => {
                    const item = document.createElement('div');
                    item.dataset.origIdx = _origIdx;
                    item.style.cssText = [
                        'padding:9px 10px', 'border-radius:8px', 'cursor:pointer',
                        'margin-bottom:4px',
                        'background:' + (_origIdx === selectedIdx ? 'rgba(99,179,237,0.15)' : 'rgba(255,255,255,0.03)'),
                        'border:1px solid ' + (_origIdx === selectedIdx ? 'rgba(99,179,237,0.4)' : 'rgba(255,255,255,0.06)'),
                        'transition:background .12s,border-color .12s'
                    ].join(';');

                    const shortTitle = title.length > 34 ? title.slice(0, 34) + '…' : title;
                    const date = new Date(ts).toLocaleDateString(undefined, { month:'short', day:'numeric' });
                    item.innerHTML = `
                        <div style="font-size:14px;font-weight:600;color:#f4f4f5;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${title.replace(/"/g,'&quot;')}">${shortTitle}</div>
                        <div style="font-size:11px;color:#71717a;margin-top:3px;display:flex;gap:8px;">
                            <span>${lang || '?'}</span>
                            <span>${date}</span>
                        </div>`;

                    item.addEventListener('mouseenter', () => {
                        if (_origIdx !== selectedIdx) item.style.background = 'rgba(99,179,237,0.08)';
                    });
                    item.addEventListener('mouseleave', () => {
                        if (_origIdx !== selectedIdx) item.style.background = 'rgba(255,255,255,0.03)';
                    });
                    item.addEventListener('click', () => {
                        selectedIdx = _origIdx;
                        renderList(document.getElementById('kc-vault-search')?.value || '');
                        renderDetail(_origIdx);
                    });
                    listPane.appendChild(item);
                });
            };

            const renderDetail = (idx) => {
                const e = entries[idx];
                if (!e) { detailPane.innerHTML = `<div style="color:#555;font-size:15px;margin:auto;">Entry not found</div>`; return; }

                detailPane.innerHTML = `
                    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;flex-shrink:0;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:17px;font-weight:700;color:#f4f4f5;line-height:1.3;word-break:break-word;">${e.title}</div>
                            <div style="font-size:12px;color:#71717a;margin-top:4px;">
                                <a href="${e.url}" target="_blank" style="color:#63b3ed;text-decoration:none;">🔗 Open problem</a>
                                &nbsp;·&nbsp; ${e.lang || 'Unknown lang'}
                                &nbsp;·&nbsp; ${new Date(e.ts).toLocaleString()}
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0;">
                            <button id="kc-vault-copy-btn" style="
                                padding:5px 12px;border:1px solid rgba(99,179,237,0.4);border-radius:7px;
                                background:rgba(99,179,237,0.15);color:#63b3ed;
                                cursor:pointer;font-size:13px;font-family:'VT323',monospace;
                                transition:background .15s;
                            ">📋 Copy Code</button>
                            <button id="kc-vault-share-btn" style="
                                padding:5px 12px;border:1px solid rgba(34,197,94,0.4);border-radius:7px;
                                background:rgba(34,197,94,0.12);color:#4ade80;
                                cursor:pointer;font-size:13px;font-family:'VT323',monospace;
                                transition:background .15s;
                            ">🔗 Copy Share Text</button>
                            <button id="kc-vault-del-btn" style="
                                padding:5px 10px;border:1px solid rgba(239,68,68,0.3);border-radius:7px;
                                background:rgba(239,68,68,0.1);color:#f87171;
                                cursor:pointer;font-size:13px;font-family:'VT323',monospace;
                                transition:background .15s;
                            ">🗑</button>
                        </div>
                    </div>
                    <div style="flex:1;overflow:auto;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:#0d1117;">
                        <pre id="kc-vault-code-pre" style="
                            margin:0;padding:16px;font-size:13px;line-height:1.6;
                            color:#e4e4e7;white-space:pre;overflow:auto;
                            font-family:'Courier New',Courier,monospace;
                        ">${e.code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
                    </div>`;

                // copy code
                document.getElementById('kc-vault-copy-btn').onclick = () => {
                    navigator.clipboard.writeText(e.code).then(() => {
                        const b = document.getElementById('kc-vault-copy-btn');
                        if (b) { b.textContent = '✅ Copied!'; setTimeout(() => { b.textContent = '📋 Copy Code'; }, 2000); }
                    }).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = e.code; ta.style.position = 'fixed'; ta.style.top = '-9999px';
                        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                        const b = document.getElementById('kc-vault-copy-btn');
                        if (b) { b.textContent = '✅ Copied!'; setTimeout(() => { b.textContent = '📋 Copy Code'; }, 2000); }
                    });
                };

                // share text
                document.getElementById('kc-vault-share-btn').onclick = () => {
                    const shareText = formatVaultEntryAsText(e);
                    navigator.clipboard.writeText(shareText).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = shareText; ta.style.position = 'fixed'; ta.style.top = '-9999px';
                        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                    });
                    const b = document.getElementById('kc-vault-share-btn');
                    if (b) { b.textContent = '✅ Copied!'; setTimeout(() => { b.textContent = '🔗 Copy Share Text'; }, 2000); }
                };

                // delete entry
                document.getElementById('kc-vault-del-btn').onclick = () => {
                    entries.splice(idx, 1);
                    vaultSave(entries);
                    selectedIdx = -1;
                    renderCount();
                    renderList(document.getElementById('kc-vault-search')?.value || '');
                    detailPane.innerHTML = `<div style="color:#555;font-size:15px;margin:auto;text-align:center;">Entry deleted</div>`;
                };
            };

            // ── Save current solution ──
            const handleSave = () => {
                const code = getCurrentCode().trim();
                const title = getCurrentProblemTitle().trim();

                if (!code) {
                    showToastPill('No code in editor to save', 'error', 2500);
                    return;
                }

                // Detect language
                let lang = 'Unknown';
                try { if (typeof getSelectedLanguage === 'function') lang = getSelectedLanguage(); } catch (_) {}

                // Check duplicate (same title + same code)
                const isDup = entries.some(en => en.title === title && en.code === code);
                if (isDup) {
                    showToastPill('Already saved (identical code + title)', 'info', 2500);
                    return;
                }

                const entry = {
                    id: Date.now() + Math.random().toString(36).slice(2),
                    title,
                    lang,
                    url: window.location.href,
                    code,
                    ts: Date.now()
                };

                entries.unshift(entry);  // newest first
                vaultSave(entries);
                selectedIdx = 0;
                renderCount();
                renderList(document.getElementById('kc-vault-search')?.value || '');
                renderDetail(0);
                showToastPill(`💾 Saved: ${title.slice(0, 40)}`, 'success', 2500);
            };

            document.getElementById('kc-vault-save-btn').onclick = handleSave;

            // Export all as plain text
            document.getElementById('kc-vault-export-btn').onclick = () => {
                if (entries.length === 0) { showToastPill('Nothing to export', 'info', 2500); return; }
                const text = entries.map(formatVaultEntryAsText).join('\n\n');
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `killcode_solutions_${new Date().toISOString().slice(0,10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                showToastPill(`Exported ${entries.length} solution(s)`, 'success', 2500);
            };

            // Clear all
            document.getElementById('kc-vault-clear-btn').onclick = () => {
                if (!entries.length) { showToastPill('Nothing to clear', 'info', 2000); return; }
                if (confirm(`Delete all ${entries.length} saved solution(s)? This cannot be undone.`)) {
                    entries = [];
                    vaultSave(entries);
                    selectedIdx = -1;
                    renderCount();
                    renderList();
                    detailPane.innerHTML = `<div style="color:#555;font-size:15px;margin:auto;text-align:center;">Cleared</div>`;
                    showToastPill('Vault cleared', 'info', 2000);
                }
            };

            // Close
            document.getElementById('kc-vault-close-btn').onclick = () => panel.remove();

            // Search
            document.getElementById('kc-vault-search').addEventListener('input', (e) => {
                renderList(e.target.value);
            });

            // Escape key to close panel (captured inside panel)
            document.getElementById('kc-vault-search').addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); panel.remove(); }
            });

            // Initial render
            renderCount();
            renderList();

            // Auto-focus search
            setTimeout(() => document.getElementById('kc-vault-search')?.focus(), 60);
        }

        // ── Input guard ────────────────────────────────────────────────────────
        function isTypingTarget(el) {
            if (!el) return false;
            const tag = (el.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (el.isContentEditable) return true;
            if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
            if (el.classList) {
                if (el.classList.contains('ace_text-input') ||
                    el.classList.contains('ace_editor') ||
                    el.classList.contains('CodeMirror-code')) return true;
            }
            let p = el.parentElement;
            for (let i = 0; i < 4 && p; i++) {
                if (p.classList && (p.classList.contains('ace_editor') ||
                                    p.classList.contains('CodeMirror'))) return true;
                p = p.parentElement;
            }
            return false;
        }

        // ── Global keydown listener ───────────────────────────────────────────
        function onKeyDown(e) {
            const key = e.key.toLowerCase();
            const activeElement = document.activeElement;
            // 'e' always toggles the Solutions Vault even when focus is inside the vault panel
            // (e.g. the search box), so pressing 'e' again reliably closes the panel.
            const inVaultPanel = activeElement && activeElement.closest && activeElement.closest('#kc-vault-panel');
            if (key === 'e' && inVaultPanel) {
                e.preventDefault();
                doVault();
                return;
            }
            const aceTarget = activeElement?.closest?.('.ace_editor') ||
                activeElement?.classList?.contains('ace_text-input');
            if (isTypingTarget(activeElement) && !(aceTarget && (key === 'w' || key === 's'))) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            switch (key) {
                case 'w': e.preventDefault(); doGhostToggle();  break;
                case 'a': e.preventDefault(); doFindIncomplete(); break;
                case 's': e.preventDefault(); doStop();          break;
                case 'd': e.preventDefault(); doAISolve();       break;
                case 'e': e.preventDefault(); doVault();         break;
            }
        }

        // ── Resolve dynamic UI refs ───────────────────────────────────────────
        function captureUIRefs() {
            let polls = 0;
            const MAX_POLLS = 40;
            const poll = setInterval(() => {
                polls++;
                if (!_settingsBtnRef) {
                    document.querySelectorAll('button').forEach(btn => {
                        const s = btn.style;
                        if (s.position === 'fixed' && s.bottom === '24px' && s.right === '24px') {
                            _settingsBtnRef = btn;
                        }
                    });
                }
                if (!_statusBarRef) {
                    const stopBtn = document.getElementById('auto-solver-stop');
                    if (stopBtn) _statusBarRef = stopBtn.parentElement || stopBtn;
                }
                if ((_settingsBtnRef && _statusBarRef) || polls >= MAX_POLLS) {
                    clearInterval(poll);
                }
            }, 800);
        }

        // ── SPA navigation guard: re-apply ghost after SkillRack AJAX DOM rebuilds
        function setupSPAGuard() {
            const observer = new MutationObserver(() => {
                if (!state.ghosted) return;
                for (const sel of STATIC_GHOST_SELECTORS) {
                    const el = document.querySelector(sel);
                    if (el && document.contains(el) &&
                        !el.classList.contains('kc-ghost-target')) {
                        el.classList.remove('kc-ghost-reveal');
                        el.classList.add('kc-ghost-target');
                    }
                }
                if (_settingsBtnRef && !document.contains(_settingsBtnRef)) _settingsBtnRef = null;
                if (_statusBarRef && !document.contains(_statusBarRef)) _statusBarRef = null;
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // ── Auto-save on manual successful submission ─────────────────────────
        // Watches for #successmsg "passed" text or growl success messages
        // and saves the current code to the vault automatically.
        function setupAutoSaveObserver() {
            let lastSavedKey = '';

            const checkForSuccess = () => {
                try {
                    // Check error panel FIRST to avoid "9 Passed 3 Failed" matching "passed"
                    const errText = ((document.getElementById('errormsg')?.innerText || '') + ' ' + (document.getElementById('errormsg_content')?.innerText || '')).toLowerCase();
                    if (errText.includes('private') || errText.includes('hidden') ||
                        errText.includes('did not pass') || errText.includes('failed') ||
                        errText.includes('wrong') || errText.includes('compilation') ||
                        (errText.includes('passed') && errText.includes('failed'))) {
                        return; // Not a genuine success — do not save
                    }

                    // Check success message panel
                    const successEl = document.getElementById('successmsg');
                    if (successEl) {
                        const text = (successEl.innerText || '').toLowerCase();
                        if ((text.includes('passed') || text.includes('success') || text.includes('correct')) &&
                            !text.includes('fail') && !text.includes('wrong') && !text.includes('error')) {
                            const code = getCurrentCode().trim();
                            const title = getCurrentProblemTitle().trim();
                            const key = title + '|' + code;
                            if (key !== lastSavedKey && code) {
                                lastSavedKey = key;
                                vaultAutoSave();
                            }
                        }
                    }

                    // Check growl messages as fallback
                    const growlItems = document.querySelectorAll('.ui-growl-item-container, .ui-growl-item');
                    for (const g of growlItems) {
                        const gt = (g.innerText || '').toLowerCase();
                        if ((gt.includes('pass') || gt.includes('success') || gt.includes('correct')) &&
                            !gt.includes('fail') && !gt.includes('error') && !gt.includes('wrong')) {
                            const code = getCurrentCode().trim();
                            const title = getCurrentProblemTitle().trim();
                            const key = title + '|' + code;
                            if (key !== lastSavedKey && code) {
                                lastSavedKey = key;
                                vaultAutoSave();
                            }
                            break;
                        }
                    }
                } catch (e) {
                    console.debug('[Vault] Auto-save observer error (non-fatal):', e);
                }
            };

            // Observe DOM changes for success messages
            const observer = new MutationObserver(() => {
                checkForSuccess();
            });
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            // Also check periodically as a fallback
            setInterval(checkForSuccess, 3000);
        }

        // ── Init ──────────────────────────────────────────────────────────────
        function init() {
            loadSavedState();
            injectStyles();
            if (state.ghosted) {
                applyGhostStylesheet(true);
            }
            document.addEventListener('keydown', onKeyDown, { capture: true });

            const attach = () => {
                captureUIRefs();
                setupSPAGuard();
                setupAutoSaveObserver();
                if (state.ghosted) {
                    getGhostTargets().forEach(el => el.classList.add('kc-ghost-target'));
                }
            };

            if (document.body) {
                attach();
            } else {
                document.addEventListener('DOMContentLoaded', attach);
            }

            console.log(`[WASD] Hotkey layer ready — Mode: ${state.ghosted ? 'INVISIBLE' : 'VISIBLE'} | State: ${state.running ? 'RUNNING' : 'STOPPED'}`);
        }

        return { init, state, doGhostToggle, doFindIncomplete, doStop, doAISolve, doVault, vaultAutoSave };
    })();

    // Initialize WASDBridge when script is enabled and DOM is ready
    onScriptEnabled(() => {
        const startWASD = () => {
            try {
                if (WASDBridge && typeof WASDBridge.init === 'function') {
                    WASDBridge.init();
                }
            } catch (e) {
                console.warn('[WASDBridge] Init error:', e);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(startWASD, 450));
        } else {
            setTimeout(startWASD, 450);
        }
        // Expose on window & unsafeWindow for console-level manual control
        window.WASDBridge = WASDBridge;
        if (typeof unsafeWindow !== 'undefined') {
            unsafeWindow.WASDBridge = WASDBridge;
        }
    });

}
