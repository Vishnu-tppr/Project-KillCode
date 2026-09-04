<p align="center">
  <img src="assets/KillCode.jpeg" alt="KillCode" width="500">
</p>

# Project-KillCode — Master Anti-Cheat & Stealth Automation Suite

Tampermonkey userscript for [skillrack.com](https://skillrack.com). Kills tab-switch detection, restores copy/paste clipboard, bypasses proctoring telemetry, auto-solves captchas, and generates complete AI solutions using your free ChatGPT account or 9+ AI providers.

**Version:** `5.1a` · **Matches:** `https://*.skillrack.com/*`, `https://skillrack.com/*`

> [!IMPORTANT]
> ⚠️ **CRITICAL DISCLAIMER & WARNING:**
>
> - **Educational Purpose Only**: This project is strictly for research and educational purposes. We take absolutely no responsibility for any actions you take, academic penalties you receive, or account bans you experience. You agree to use this entirely at your own risk.
> - **Account Ban Risk**: Accessing private Codex endpoints directly violates OpenAI's terms of service. **OpenAI can and will ban your account if they detect unauthorized automated usage.**
> - **USE A SECONDARY CHATGPT ACCOUNT**: Do **NOT** use your primary personal, academic, or work account. Create a secondary throwaway account to use with this script.
> - **Bypass Disclaimer**: Bypassing anti-cheat systems violates SkillRack's Terms of Use and your institution's academic honor codes.

---

## Technical Summary of Features & Bypasses

| Category | Feature | Implementation & Architecture |
|---|---|---|
| **Tab Detection Sandbox** | Isolated Anti-Proctoring Firewall | Overrides `document.visibilityState` (`visible`), `document.hidden` (`false`), `document.hasFocus()` (`true`), and `window.hasFocus()` (`true`). Blocks `blur`, `focus`, `visibilitychange`, `mouseleave`, `mouseout`, `pointerleave`, and `freeze` events at the `EventTarget.prototype` level. |
| **Telemetry Firewall** | Heartbeat & Tracking Suppressor | Intercepts `sendBeacon`, `fetch`, and `XMLHttpRequest` targeting proctoring/logging endpoints, dropping tracking pings while returning mock `200 OK` HTTP responses. |
| **Session Maintenance** | Silent Keep-Alive Loop | Runs a silent background `HEAD` request loop every 2.5 minutes to maintain active server session cookies and prevent unexpected timeouts. |
| **Editor Integration** | Universal Ace & DOM Resolver | Dynamic `getEditor()` & `insertCodeIntoEditor()` resolves Ace Editors, `#txtCode`, and DOM `<textarea>` elements across Daily Tests, Daily Challenges, MCQs, and MFIB assessments. |
| **Typing Simulation** | Natural Human Typing Mode | Press **`Q`** to toggle between Instant Code Insertion and Human Typing Simulation (variable char-by-char delay with thinking pauses). |
| **Clipboard & Selection** | Full Copy/Paste Enforcement | Strips `bte` key blocks from Ace Editor, neutralizes jQuery clipboard listeners, and restores drag & drop, text selection, and context menus. |
| **Popup Neutralization** | Visual Toast Pill System | Intercepts native `window.alert` & `confirm` modal dialogs during assessments and renders non-blocking, smooth toast notifications (`showToastPill`). |
| **OCR Captcha Solver** | Tesseract.js & Puter OCR | Auto-detects and inverts captcha image elements; runs OCR pipeline to extract and submit captcha answers automatically. |
| **AI Solution Engine** | Multi-Provider AI Generation | Supports 9+ AI provider backends (Gemini, ChatGPT via `openai-oauth`, DuckDuckGo, Groq, OpenRouter, G4F, YuppBridge, OpenAI API, Local Server). |
| **Hotkeys & Overlay** | WASD Stealth Bridge | WASDBridge provides hotkeys for ghost toggles, code inspection, and manual AI triggers with SPA guard DOM re-attachers. |

---

## AI Providers Supported

| Provider | Cost | Authentication |
|---|---|---|
| **ChatGPT (openai-oauth)** | Free | Browser OAuth session (no API key required) |
| **DuckDuckGo AI** | Free | Zero setup / account-free endpoint |
| **Google Gemini** | Free Tier | API Key via [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **Groq / Llama 3** | Free Tier | API Key via Groq Console |
| **OpenRouter** | Free + Paid | 300+ models via [OpenRouter](https://openrouter.ai/keys) |
| **G4F Space** | Free | Account-free proxy endpoint |
| **YuppBridge** | Self-Hosted | 200+ models via self-hosted YuppBridge instance |
| **OpenAI Direct API** | Paid | Standard OpenAI API Key (`sk-...`) |
| **Local Pre-Solved DB** | Free | Local GitHub/Offline repository solver database |

---

## Installation & Setup

1. Install **[Tampermonkey](https://www.tampermonkey.net/)** in your browser (Chrome, Firefox, Edge, Brave).
2. Install the userscript directly from the repository:
   - File: `Project-KillCode.js` or `userscript.user.js`
3. Open any SkillRack page (`https://www.skillrack.com/*`).
4. Click the floating **⚙️ Settings** icon in the bottom-right corner to configure your preferred AI Provider and Bypass options.

---

## Repository File Map

- `Project-KillCode.js` — Main 14,500+ line Userscript application file.
- `userscript.user.js` — Synchronized production build for Tampermonkey auto-update.
- `.gitignore` — Filters development tools, temporary Python validators, node dependencies, build artifacts, and environment keys.
- `chrome-extension/` — "Sign in with ChatGPT" helper extension for seamless browser OAuth session interception (build via `bun run build` / `bun run pack`, see `chrome-extension/README.md` and `SETUP.md`).
- `tools/` — Standalone Python + curl toolkit for enumerating, fetching, verifying, and tracking SkillRack CODETUTOR/CODETRACK problems (see `tools/README.md`).
- `skillrack-scraper/` — Python package for scraping SkillRack candidate data, with its own `tests/` suite.
- `document.md` / `skill.md` / `skillrack-solver-skill.md` — Generated tracker and solver-skill reference docs.
- `kill.txt` — Remote kill-switch flag file polled by the userscript.
- `PRIVACY.md` & `SECURITY.md` — Security disclosures and privacy policies.

---

## Keyboard Shortcuts

- **`Q`** — Toggle Human Typing Speed Mode ON (natural typing) / OFF (instant insert).
- **`WASD` Hotkey Layer** — Invisibility & Ghost UI controls.

---

## Troubleshooting

**Clipboard still blocked**
Check console for "Blocked" — means a jQuery handler ran before the script. Confirm `@run-at document-start` is set in Tampermonkey's script settings.

**ACE editor blank / `getSession is not a function`**
Usually means the editor loaded before the interception. Try force-refreshing (Ctrl+Shift+R).

**Captcha not solving**
Wait 3-5 seconds on first run (Tesseract download). If it loops, close and reopen the tab.

**ChatGPT provider not working**
- Extension not installed? → Install from the Chrome Web Store or load `chrome-extension/` unpacked (see `chrome-extension/SETUP.md`).
- Token expired? → re-sign in from Settings.
- Getting 403? → OpenAI may have patched the endpoint. [File an issue](https://github.com/Vishnu-tppr/Project-KillCode/issues).

**OpenRouter models not loading**
Click the 🔄 button in the model selector. Models cache for 6 hours.

---

## Credits

- **[ToonTamilIndia](https://github.com/ToonTamilIndia)** — main development
- **[adithyagenie](https://github.com/adithyagenie/skillrack-captcha-solver)** — captcha solver
- **[EvanZhouDev/openai-oauth](https://github.com/EvanZhouDev/openai-oauth)** — openai-oauth SDK (Apache-2.0)
- **[Vishnu-tppr](https://github.com/Vishnu-tppr)** — ChatGPT integration & reverse engineering

---

## License

MIT License. Educational and Research Use Only.
