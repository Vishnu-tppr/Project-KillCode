#!/usr/bin/env python3
"""
UI Transformation script for Anti-Cheat Bypass userscript.
- Replaces emoji with SVG icons
- Adds Google Fonts (Inter)
- Adds premium animations and glassmorphism
- Replaces settings ⚙️ button with custom pixel-art image
- Improves all dialogs with modern dark glassmorphism design
"""
import re, sys

ICON_B64 = open(r'D:\Skillrack-Script\icon_small_b64.txt').read().strip()
SOURCE   = r'D:\Skillrack-Script\Anti-Cheat Bypass 5.0.user.js'
OUTPUT   = r'D:\Skillrack-Script\Anti-Cheat Bypass 5.0.user.js'

src = open(SOURCE, 'r', encoding='utf-8').read()

# ─────────────────────────────────────────────────────────────────────────────
# 1.  FLOATING SETTINGS BUTTON  (⚙️  →  custom pixel-art image)
# ─────────────────────────────────────────────────────────────────────────────

OLD_BTN = r"""        // Create settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Bypass Settings';
        settingsBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: none;
            background: #4CAF50;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            transition: transform 0.2s, background 0.2s;
        `;
        settingsBtn.onmouseover = () => settingsBtn.style.transform = 'scale(1.1)';
        settingsBtn.onmouseout = () => settingsBtn.style.transform = 'scale(1)';"""

NEW_BTN = r"""        // Inject Google Fonts once
        if (!document.getElementById('bypass-gfont')) {
            const gfont = document.createElement('link');
            gfont.id = 'bypass-gfont';
            gfont.rel = 'stylesheet';
            gfont.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
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
        settingsBtn.innerHTML = `<img src="${ICON_B64_PLACEHOLDER}" alt="Settings" style="width:46px;height:46px;object-fit:cover;border-radius:50%;display:block;transition:transform 0.3s ease,filter 0.3s ease;">`;
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
            settingsBtn.querySelector('img').style.filter = 'brightness(1.15) drop-shadow(0 0 8px rgba(239,68,68,0.8))';
        };
        settingsBtn.onmouseout = () => {
            settingsBtn.style.transform = 'scale(1) rotate(0deg)';
            settingsBtn.querySelector('img').style.filter = 'none';
        };"""

# Replace ICON_B64_PLACEHOLDER with the actual base64 icon
NEW_BTN = NEW_BTN.replace('${ICON_B64_PLACEHOLDER}', ICON_B64)

src = src.replace(OLD_BTN, NEW_BTN)

# ─────────────────────────────────────────────────────────────────────────────
# 2.  SETTINGS PANEL  (dark glassmorphism upgrade)
# ─────────────────────────────────────────────────────────────────────────────

OLD_PANEL_CSS = r"""        panel.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            z-index: 99998;
            width: 320px;
            max-height: 500px;
            overflow-y: auto;
            background: #1e1e1e;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;"""

NEW_PANEL_CSS = r"""        panel.style.cssText = `
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
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;"""

src = src.replace(OLD_PANEL_CSS, NEW_PANEL_CSS)

# ─────────────────────────────────────────────────────────────────────────────
# 3.  PANEL HEADER  (🛡️ → SVG shield + gradient title)
# ─────────────────────────────────────────────────────────────────────────────

OLD_PANEL_HDR_CSS = r"""        panelHeader.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid #333;
            background: #2d2d2d;
            border-radius: 12px 12px 0 0;
        `;
        panelHeader.innerHTML = `
            <h3 style="margin: 0; color: #4CAF50; font-size: 16px;">🛡️ Bypass Settings</h3>
            <small style="color: #888;">Toggle features on/off</small>
        `;"""

NEW_PANEL_HDR_CSS = r"""        panelHeader.style.cssText = `
            padding: 18px 20px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(15,15,15,0) 60%);
            border-radius: 18px 18px 0 0;
        `;
        panelHeader.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <svg viewBox="0 0 24 24" width="22" height="22" style="flex-shrink:0;filter:drop-shadow(0 0 6px rgba(239,68,68,0.6));">
                    <defs><linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ef4444"/><stop offset="100%" style="stop-color:#b91c1c"/></linearGradient></defs>
                    <path fill="url(#shieldGrad)" d="M12 2L4 5v6c0 5.25 3.4 10.15 8 11.35C16.6 21.15 20 16.25 20 11V5l-8-3zm-1 13l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z"/>
                </svg>
                <h3 style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.3px;background:linear-gradient(90deg,#ef4444,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Bypass Settings</h3>
            </div>
            <small style="color:#71717a;font-size:11px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;">Configure features &amp; AI providers</small>
        `;"""

src = src.replace(OLD_PANEL_HDR_CSS, NEW_PANEL_HDR_CSS)

# ─────────────────────────────────────────────────────────────────────────────
# 4.  PANEL CONTENT padding
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    "panelContent.style.cssText = 'padding: 12px;';",
    "panelContent.style.cssText = 'padding: 12px 14px 14px;';"
)

# ─────────────────────────────────────────────────────────────────────────────
# 5.  createToggle – premium pill toggle with Inter font
# ─────────────────────────────────────────────────────────────────────────────

OLD_TOGGLE = r"""        const createToggle = (id, label, checked, description = '') => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #333;
            `;
            wrapper.innerHTML = `
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 13px;">${label}</div>
                    ${description ? `<div style="color: #666; font-size: 11px; margin-top: 2px;">${description}</div>` : ''}
                </div>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                    <span style="
                        position: absolute;
                        cursor: pointer;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background-color: ${checked ? '#4CAF50' : '#555'};
                        transition: .3s;
                        border-radius: 24px;
                    "></span>
                    <span style="
                        position: absolute;
                        content: '';
                        height: 18px;
                        width: 18px;
                        left: ${checked ? '23px' : '3px'};
                        bottom: 3px;
                        background-color: white;
                        transition: .3s;
                        border-radius: 50%;
                    "></span>
                </label>
            `;

            const checkbox = wrapper.querySelector('input');
            const slider = wrapper.querySelector('span:first-of-type');
            const circle = wrapper.querySelector('span:last-of-type');

            checkbox.addEventListener('change', () => {
                SETTINGS[id] = checkbox.checked;
                slider.style.backgroundColor = checkbox.checked ? '#4CAF50' : '#555';
                circle.style.left = checkbox.checked ? '23px' : '3px';
                saveSettings(SETTINGS);
            });

            return wrapper;
        };"""

NEW_TOGGLE = r"""        const createToggle = (id, label, checked, description = '') => {
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
            `;
            wrapper.onmouseover = () => wrapper.style.background = 'rgba(255,255,255,0.03)';
            wrapper.onmouseout  = () => wrapper.style.background = 'transparent';
            wrapper.innerHTML = `
                <div style="flex: 1; padding-right: 12px;">
                    <div style="color: #e4e4e7; font-size: 12.5px; font-weight: 500; font-family: 'Inter', sans-serif;">${label}</div>
                    ${description ? `<div style="color: #52525b; font-size: 10.5px; margin-top: 2px; font-family: 'Inter', sans-serif; line-height:1.4;">${description}</div>` : ''}
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
            const slider   = wrapper.querySelector('span:first-of-type');
            const circle   = wrapper.querySelector('span:last-of-type');

            checkbox.addEventListener('change', () => {
                SETTINGS[id] = checkbox.checked;
                slider.style.background = checkbox.checked ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#27272a';
                slider.style.boxShadow  = checkbox.checked ? '0 0 8px rgba(239,68,68,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.4)';
                circle.style.left       = checkbox.checked ? '22px' : '3px';
                saveSettings(SETTINGS);
            });

            return wrapper;
        };"""

src = src.replace(OLD_TOGGLE, NEW_TOGGLE)

# ─────────────────────────────────────────────────────────────────────────────
# 6.  createTextInput – styled with Inter
# ─────────────────────────────────────────────────────────────────────────────

OLD_TI = r"""        const createTextInput = (id, label, value, placeholder = '') => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'padding: 10px 0; border-bottom: 1px solid #333;';
            wrapper.innerHTML = `
                <div style="color: #fff; font-size: 13px; margin-bottom: 6px;">${label}</div>
                <input type="text" id="${id}" value="${value}" placeholder="${placeholder}" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #2d2d2d;
                    color: #fff;
                    font-size: 12px;
                    box-sizing: border-box;
                ">
            `;

            const input = wrapper.querySelector('input');
            input.addEventListener('change', () => {
                SETTINGS[id] = input.value;
                saveSettings(SETTINGS);
            });

            return wrapper;
        };"""

NEW_TI = r"""        const createTextInput = (id, label, value, placeholder = '') => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';
            wrapper.innerHTML = `
                <div style="color: #a1a1aa; font-size: 11px; font-weight: 600; font-family: 'Inter',sans-serif; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.6px;">${label}</div>
                <input type="text" id="${id}" value="${value}" placeholder="${placeholder}" style="
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.05);
                    color: #e4e4e7;
                    font-size: 12px;
                    box-sizing: border-box;
                    font-family: 'Inter', monospace;
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
        };"""

src = src.replace(OLD_TI, NEW_TI)

# ─────────────────────────────────────────────────────────────────────────────
# 7.  createSectionHeader – gradient + pill badge style
# ─────────────────────────────────────────────────────────────────────────────

OLD_SH = r"""        const createSectionHeader = (title, iconPath = '') => {
            const header = document.createElement('div');
            header.style.cssText = `
                color: #4CAF50;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                padding: 12px 0 6px 0;
                letter-spacing: 1.2px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 2px solid #333;
                margin-top: 10px;
                margin-bottom: 5px;
            `;

            if (iconPath) {
                header.innerHTML = `
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="${iconPath}"></path>
                    </svg>
                    <span>${title}</span>
                `;
            } else {
                header.textContent = title;
            }
            return header;
        };"""

NEW_SH = r"""        const createSectionHeader = (title, iconPath = '') => {
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
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.4px;
                    font-family: 'Inter', sans-serif;
                ">${title}</span>
            `;
            return header;
        };"""

src = src.replace(OLD_SH, NEW_SH)

# ─────────────────────────────────────────────────────────────────────────────
# 8.  Temperature slider – style upgrade
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    "        const tempWrapper = document.createElement('div');\n"
    "        tempWrapper.style.cssText = 'padding: 10px 0; border-bottom: 1px solid #333;';",
    "        const tempWrapper = document.createElement('div');\n"
    "        tempWrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';"
)

src = src.replace(
    "            <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;\">\n"
    "                <div style=\"color: #fff; font-size: 13px;\">AI Temperature</div>\n"
    "                <div id=\"temp-value\" style=\"color: #4CAF50; font-size: 13px; font-weight: bold;\">${SETTINGS.aiTemperature}</div>\n"
    "            </div>\n"
    "            <input type=\"range\" id=\"aiTemperature\" min=\"0\" max=\"1\" step=\"0.1\" value=\"${SETTINGS.aiTemperature}\" style=\"\n"
    "                width: 100%;\n"
    "                height: 4px;\n"
    "                background: #444;\n"
    "                border-radius: 2px;\n"
    "                outline: none;\n"
    "                cursor: pointer;\n"
    "                accent-color: #4CAF50;\n"
    "            \">\n"
    "            <div style=\"color: #888; font-size: 11px; margin-top: 4px;\">Lower is more predictable, higher is more creative.</div>",

    "            <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\">\n"
    "                <div style=\"color:#a1a1aa;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;font-family:'Inter',sans-serif;\">AI Temperature</div>\n"
    "                <div id=\"temp-value\" style=\"color:#ef4444;font-size:12px;font-weight:700;font-family:'Inter',monospace;background:rgba(239,68,68,0.1);padding:2px 8px;border-radius:99px;border:1px solid rgba(239,68,68,0.25);\">${SETTINGS.aiTemperature}</div>\n"
    "            </div>\n"
    "            <input type=\"range\" id=\"aiTemperature\" min=\"0\" max=\"1\" step=\"0.1\" value=\"${SETTINGS.aiTemperature}\" style=\"\n"
    "                width: 100%;\n"
    "                height: 5px;\n"
    "                background: #27272a;\n"
    "                border-radius: 3px;\n"
    "                outline: none;\n"
    "                cursor: pointer;\n"
    "                accent-color: #ef4444;\n"
    "            \">\n"
    "            <div style=\"color:#52525b;font-size:10.5px;margin-top:5px;font-family:'Inter',sans-serif;\">Lower = deterministic &nbsp;·&nbsp; Higher = creative</div>"
)

# fix temp-value color update
src = src.replace(
    "document.getElementById('temp-value').textContent = val;",
    "const tv = document.getElementById('temp-value'); if(tv){tv.textContent=val;}"
)

# ─────────────────────────────────────────────────────────────────────────────
# 9.  Custom System Prompt textarea
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    "        promptWrapper.style.cssText = 'padding: 10px 0; border-bottom: 1px solid #333;';",
    "        promptWrapper.style.cssText = 'padding: 9px 2px; border-bottom: 1px solid rgba(255,255,255,0.05);';"
)
src = src.replace(
    '            <div style="color: #fff; font-size: 13px; margin-bottom: 6px;">Custom System Prompt</div>',
    '            <div style="color:#a1a1aa;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:7px;font-family:\'Inter\',sans-serif;">Custom System Prompt</div>'
)
src = src.replace(
    '            <textarea id="aiSystemPrompt" placeholder="Inject custom instructions to AI solver..." style="\n'
    '                width: 100%;\n'
    '                height: 60px;\n'
    '                padding: 8px;\n'
    '                border: 1px solid #444;\n'
    '                border-radius: 6px;\n'
    '                background: #2d2d2d;\n'
    '                color: #fff;\n'
    '                font-size: 12px;\n'
    '                resize: vertical;\n'
    '                box-sizing: border-box;\n'
    '                font-family: inherit;\n'
    '            ">',
    '            <textarea id="aiSystemPrompt" placeholder="Inject custom instructions to AI solver..." style="\n'
    '                width: 100%;\n'
    '                height: 62px;\n'
    '                padding: 8px 10px;\n'
    '                border: 1px solid rgba(255,255,255,0.1);\n'
    '                border-radius: 8px;\n'
    '                background: rgba(255,255,255,0.05);\n'
    '                color: #e4e4e7;\n'
    '                font-size: 11.5px;\n'
    '                resize: vertical;\n'
    '                box-sizing: border-box;\n'
    '                font-family: \'Inter\', monospace;\n'
    '                outline: none;\n'
    '                transition: border-color 0.2s;\n'
    '" onfocus="this.style.borderColor=\'rgba(239,68,68,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.1)\'">'
)
src = src.replace(
    '            <div style="color: #888; font-size: 11px; margin-top: 4px;">Prepended to every AI request. Absolute priority.</div>',
    '            <div style="color:#52525b;font-size:10.5px;margin-top:5px;font-family:\'Inter\',sans-serif;">Prepended to every AI request · Absolute priority</div>'
)

# ─────────────────────────────────────────────────────────────────────────────
# 10. Panel OPEN animation
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    "        settingsBtn.addEventListener('click', () => {\n"
    "            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';\n"
    "        });",
    "        settingsBtn.addEventListener('click', () => {\n"
    "            if (panel.style.display === 'none' || !panel.style.display) {\n"
    "                panel.style.display = 'block';\n"
    "                panel.style.animation = 'bypassSlideIn 0.28s cubic-bezier(.34,1.56,.64,1) forwards';\n"
    "            } else {\n"
    "                panel.style.animation = '';\n"
    "                panel.style.display = 'none';\n"
    "            }\n"
    "        });"
)

# Fix the close-outside handler:
# The button now contains a child <img>. e.target when clicking the image
# is the <img>, not the <button>, so strict equality fails and the panel
# closes immediately. Use .contains() to cover the whole button subtree.
src = src.replace(
    "        // Close panel when clicking outside\n"
    "        document.addEventListener('click', (e) => {\n"
    "            if (!panel.contains(e.target) && e.target !== settingsBtn) {\n"
    "                panel.style.display = 'none';\n"
    "            }\n"
    "        });",
    "        // Close panel when clicking outside\n"
    "        // NOTE: use .contains() so clicking the child <img> doesn't close the panel.\n"
    "        document.addEventListener('click', (e) => {\n"
    "            if (!panel.contains(e.target) && !settingsBtn.contains(e.target)) {\n"
    "                panel.style.display = 'none';\n"
    "            }\n"
    "        });"
)

# ─────────────────────────────────────────────────────────────────────────────
# 11. Footer note in panel
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    "        note.style.cssText = 'color: #666; font-size: 10px; padding: 12px 0; text-align: center;';",
    "        note.style.cssText = 'color:#3f3f46;font-size:10px;padding:14px 4px;text-align:center;font-family:\"Inter\",sans-serif;line-height:1.7;border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;';"
)

# ─────────────────────────────────────────────────────────────────────────────
# 12. OVERLAY dialogs – glassmorphism dark
# ─────────────────────────────────────────────────────────────────────────────

OVERLAY_FONT = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
OVERLAY_FONT_NEW = "font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"

src = src.replace(OVERLAY_FONT, OVERLAY_FONT_NEW)

# Update overlay backgrounds from solid to glassmorphism
src = src.replace(
    "background: rgba(0, 0, 0, 0.9);",
    "background: rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);"
)
src = src.replace(
    "background: rgba(0, 0, 0, 0.95);",
    "background: rgba(0,0,0,0.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"
)

# Update dialog card backgrounds
src = src.replace(
    '                    background: #1e1e1e;\n'
    '                    border-radius: 16px;\n'
    '                    padding: 32px;\n'
    '                    max-width: 450px;\n'
    '                    text-align: center;\n'
    '                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);\n'
    '                    border: 2px solid #f44336;',
    '                    background: rgba(15,15,15,0.97);\n'
    '                    border-radius: 20px;\n'
    '                    padding: 36px 32px;\n'
    '                    max-width: 450px;\n'
    '                    text-align: center;\n'
    '                    box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;\n'
    '                    border: 1px solid rgba(239,68,68,0.3);\n'
    '                    animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;'
)
src = src.replace(
    '                background: #1e1e1e;\n'
    '                border-radius: 16px;\n'
    '                padding: 32px;\n'
    '                max-width: 400px;\n'
    '                text-align: center;\n'
    '                box-shadow: 0 20px 60px rgba(0,0,0,0.5);\n'
    '                border: 2px solid #f44336;',
    '                background: rgba(15,15,15,0.97);\n'
    '                border-radius: 20px;\n'
    '                padding: 36px 32px;\n'
    '                max-width: 400px;\n'
    '                text-align: center;\n'
    '                box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;\n'
    '                border: 1px solid rgba(239,68,68,0.3);\n'
    '                animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;'
)
src = src.replace(
    '                    background: #1e1e1e;\n'
    '                    border-radius: 16px;\n'
    '                    padding: 32px;\n'
    '                    max-width: 500px;\n'
    '                    text-align: center;\n'
    '                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);\n'
    '                    border: 2px solid #ff9800;',
    '                    background: rgba(15,15,15,0.97);\n'
    '                    border-radius: 20px;\n'
    '                    padding: 36px 32px;\n'
    '                    max-width: 500px;\n'
    '                    text-align: center;\n'
    '                    box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;\n'
    '                    border: 1px solid rgba(249,115,22,0.35);\n'
    '                    animation: bypassSlideIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards;'
)

# ─────────────────────────────────────────────────────────────────────────────
# 13. Dialog heading colors
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    '<h2 style="color: #f44336; margin: 0 0 16px 0; font-size: 24px;">Update Required</h2>',
    '<h2 style="margin:0 0 14px;font-size:22px;font-weight:800;font-family:\'Inter\',sans-serif;background:linear-gradient(90deg,#ef4444,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Update Required</h2>'
)
src = src.replace(
    '<h2 style="color: #f44336; margin: 0 0 16px 0; font-size: 24px;">Script Disabled</h2>',
    '<h2 style="margin:0 0 14px;font-size:22px;font-weight:800;font-family:\'Inter\',sans-serif;background:linear-gradient(90deg,#ef4444,#dc2626);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Script Disabled</h2>'
)
src = src.replace(
    '<h2 style="color: #ff9800; margin: 0 0 16px 0; font-size: 22px;">Disclaimer &amp; Terms of Use</h2>',
    '<h2 style="margin:0 0 14px;font-size:20px;font-weight:800;font-family:\'Inter\',sans-serif;background:linear-gradient(90deg,#f97316,#eab308);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Disclaimer &amp; Terms of Use</h2>'
)

# ─────────────────────────────────────────────────────────────────────────────
# 14. Dialog buttons – premium style
# ─────────────────────────────────────────────────────────────────────────────

OLD_UPDATE_BTN = (
    '                        <button id="bypass-update-btn" style="\n'
    '                            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);\n'
    '                            color: white;\n'
    '                            border: none;\n'
    '                            padding: 12px 32px;\n'
    '                            border-radius: 8px;\n'
    '                            font-size: 14px;\n'
    '                            font-weight: bold;\n'
    '                            cursor: pointer;\n'
    '                            transition: transform 0.2s;\n'
    '                        ">Update Now</button>\n'
    '                        <button id="bypass-update-close" style="\n'
    '                            background: #333;\n'
    '                            color: #888;\n'
    '                            border: 1px solid #444;\n'
    '                            padding: 12px 24px;\n'
    '                            border-radius: 8px;\n'
    '                            font-size: 14px;\n'
    '                            cursor: pointer;\n'
    '                        ">Close (Disable Script)</button>'
)
NEW_UPDATE_BTN = (
    '                        <button id="bypass-update-btn" style="\n'
    '                            background: linear-gradient(135deg,#22c55e,#16a34a);\n'
    '                            color: white;\n'
    '                            border: none;\n'
    '                            padding: 11px 28px;\n'
    '                            border-radius: 10px;\n'
    '                            font-size: 13px;\n'
    '                            font-weight: 700;\n'
    '                            cursor: pointer;\n'
    '                            font-family: \'Inter\', sans-serif;\n'
    '                            letter-spacing: 0.3px;\n'
    '                            transition: transform 0.2s, box-shadow 0.2s;\n'
    '                            box-shadow: 0 4px 16px rgba(34,197,94,0.3);\n'
    '" onmouseover="this.style.transform=\'scale(1.04)\'" onmouseout="this.style.transform=\'scale(1)\'">Update Now</button>\n'
    '                        <button id="bypass-update-close" style="\n'
    '                            background: rgba(255,255,255,0.06);\n'
    '                            color: #71717a;\n'
    '                            border: 1px solid rgba(255,255,255,0.1);\n'
    '                            padding: 11px 20px;\n'
    '                            border-radius: 10px;\n'
    '                            font-size: 13px;\n'
    '                            font-family: \'Inter\', sans-serif;\n'
    '                            cursor: pointer;\n'
    '                            transition: background 0.2s;\n'
    '" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.06)\'">Close (Disable Script)</button>'
)
src = src.replace(OLD_UPDATE_BTN, NEW_UPDATE_BTN)

OLD_ACCEPT_BTN = (
    '                        <button id="bypass-accept-btn" style="\n'
    '                            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);\n'
    '                            color: white;\n'
    '                            border: none;\n'
    '                            padding: 12px 32px;\n'
    '                            border-radius: 8px;\n'
    '                            font-size: 14px;\n'
    '                            font-weight: bold;\n'
    '                            cursor: pointer;\n'
    '                        ">I Accept &amp; Understand</button>\n'
    '                        <button id="bypass-decline-btn" style="\n'
    '                            background: #333;\n'
    '                            color: #888;\n'
    '                            border: 1px solid #444;\n'
    '                            padding: 12px 24px;\n'
    '                            border-radius: 8px;\n'
    '                            font-size: 14px;\n'
    '                            cursor: pointer;\n'
    '                        ">Decline</button>'
)
NEW_ACCEPT_BTN = (
    '                        <button id="bypass-accept-btn" style="\n'
    '                            background: linear-gradient(135deg,#22c55e,#16a34a);\n'
    '                            color: white;\n'
    '                            border: none;\n'
    '                            padding: 11px 28px;\n'
    '                            border-radius: 10px;\n'
    '                            font-size: 13px;\n'
    '                            font-weight: 700;\n'
    '                            cursor: pointer;\n'
    '                            font-family: \'Inter\', sans-serif;\n'
    '                            letter-spacing: 0.3px;\n'
    '                            box-shadow: 0 4px 16px rgba(34,197,94,0.3);\n'
    '                            transition: transform 0.2s;\n'
    '" onmouseover="this.style.transform=\'scale(1.04)\'" onmouseout="this.style.transform=\'scale(1)\'">I Accept &amp; Understand</button>\n'
    '                        <button id="bypass-decline-btn" style="\n'
    '                            background: rgba(255,255,255,0.06);\n'
    '                            color: #71717a;\n'
    '                            border: 1px solid rgba(255,255,255,0.1);\n'
    '                            padding: 11px 20px;\n'
    '                            border-radius: 10px;\n'
    '                            font-size: 13px;\n'
    '                            font-family: \'Inter\', sans-serif;\n'
    '                            cursor: pointer;\n'
    '                            transition: background 0.2s;\n'
    '" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.06)\'">Decline</button>'
)
src = src.replace(OLD_ACCEPT_BTN, NEW_ACCEPT_BTN)

# ─────────────────────────────────────────────────────────────────────────────
# 15. Disclaimer scrollable box
# ─────────────────────────────────────────────────────────────────────────────

src = src.replace(
    '                    <div style="\n'
    '                        background: #2d2d2d;\n'
    '                        border-radius: 8px;\n'
    '                        padding: 16px;\n'
    '                        margin-bottom: 20px;\n'
    '                        text-align: left;\n'
    '                        max-height: 200px;\n'
    '                        overflow-y: auto;\n'
    '                        font-size: 12px;\n'
    '                        color: #ccc;\n'
    '                        line-height: 1.6;\n'
    '                    ">',
    '                    <div style="\n'
    '                        background: rgba(255,255,255,0.04);\n'
    '                        border: 1px solid rgba(255,255,255,0.08);\n'
    '                        border-radius: 10px;\n'
    '                        padding: 14px 16px;\n'
    '                        margin-bottom: 18px;\n'
    '                        text-align: left;\n'
    '                        max-height: 200px;\n'
    '                        overflow-y: auto;\n'
    '                        font-size: 11.5px;\n'
    '                        color: #a1a1aa;\n'
    '                        line-height: 1.65;\n'
    '                        font-family: \'Inter\', sans-serif;\n'
    '                    ">'
)

# ─────────────────────────────────────────────────────────────────────────────
# 16. Replace emoji in yuppbridge/g4f wrappers with SVG icons
# ─────────────────────────────────────────────────────────────────────────────

# 🔄 refresh button
src = src.replace(
    '>🔄</button>',
    '><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>'
)

# ❤️ health button
src = src.replace(
    '>❤️</button>',
    '><svg viewBox="0 0 24 24" width="13" height="13" fill="#ef4444" style="display:block;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>'
)

# ⏳ loading state
src = src.replace(
    "refreshBtn.textContent = '⏳';",
    "refreshBtn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" style=\"display:block;animation:bypassSpin 1s linear infinite\"><path d=\"M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z\"/></svg>';"
)
src = src.replace(
    "refreshBtn.textContent = '🔄';",
    "refreshBtn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" style=\"display:block\"><path d=\"M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z\"/></svg>';"
)
src = src.replace(
    "healthBtn.textContent = '⏳';",
    "healthBtn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" style=\"display:block;animation:bypassSpin 1s linear infinite\"><path d=\"M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z\"/></svg>';"
)
src = src.replace(
    "healthBtn.textContent = '❤️';",
    "healthBtn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"#ef4444\" style=\"display:block\"><path d=\"M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z\"/></svg>';"
)

# ─────────────────────────────────────────────────────────────────────────────
# 17. Emoji in innerHTML strings  →  SVG or text
# ─────────────────────────────────────────────────────────────────────────────

EMOJI_REPLACEMENTS = [
    # (old, new)
    ("🛡️ Bypass Settings", "Bypass Settings"),   # already handled by new header
    ("✨ Self-hosted Yupp AI Proxy",
     '<svg viewBox="0 0 24 24" width="12" height="12" fill="#3b82f6" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>Self-hosted Yupp AI Proxy'),
    ("📖 Self-host Guide", "Self-host Guide"),
    (">🌉 YuppBridge (200+ Models)<",
     '><svg viewBox="0 0 24 24" width="13" height="13" fill="#3b82f6" style="display:inline-block;vertical-align:middle;margin-right:5px"><path d="M4 13h16v-2H4v2zm-2 4h20v-2H2v2zM2 7v2h20V7H2z"/></svg>YuppBridge (200+ Models)<'),
    ("✓ API is healthy", "✓ API is healthy"),
    ("✗ ", "✗ "),
]

for old_txt, new_txt in EMOJI_REPLACEMENTS:
    src = src.replace(old_txt, new_txt)

# ─────────────────────────────────────────────────────────────────────────────
# 18. Provider selector selects + inputs – consistent dark style
# ─────────────────────────────────────────────────────────────────────────────

# Generic select style upgrade for all provider selects inside wrappers
DARK_SELECT = (
    '                    background: #2d2d2d;\n'
    '                    color: #fff;\n'
    '                    font-size: 11px;\n'
    '                    box-sizing: border-box;\n'
    '                ">'
)
DARK_SELECT_NEW = (
    '                    background: rgba(255,255,255,0.05);\n'
    '                    color: #e4e4e7;\n'
    '                    font-size: 11px;\n'
    '                    box-sizing: border-box;\n'
    '                    font-family: \'Inter\', sans-serif;\n'
    '                ">'
)
src = src.replace(DARK_SELECT, DARK_SELECT_NEW)

# ─────────────────────────────────────────────────────────────────────────────
# Write output
# ─────────────────────────────────────────────────────────────────────────────

open(OUTPUT, 'w', encoding='utf-8').write(src)
print(f"[OK] Done. Written {len(src):,} bytes to {OUTPUT}")
