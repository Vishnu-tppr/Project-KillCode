<p align="center">
  <img src="assets/KillCode.jpeg" alt="KillCode" width="500">
</p>

# Anti-Cheat Bypass

Tampermonkey userscript for [skillrack.com](https://skillrack.com). Kills tab-switch detection, restores clipboard, solves captchas, and generates code solutions using your ChatGPT account — no API key, no payment.

**Version:** `5.0f` · **Matches:** `*.skillrack.com/*`

> [!IMPORTANT]
> ⚠️ **CRITICAL DISCLAIMER & WARNING:**
>
> - **Educational Purpose Only**: This project is strictly for research and educational purposes. We take absolutely no responsibility for any actions you take, academic penalties you receive, or account bans you experience. You agree to use this entirely at your own risk.
> - **Account Ban Risk**: Accessing the private Codex endpoint directly violates OpenAI's terms of service. **OpenAI can and will ban your account if they detect unauthorized automated usage.**
> - **USE A SECONDARY CHATGPT ACCOUNT**: Do **NOT** use your primary personal, academic, or work account. Create a secondary throwaway account to use with this script.
> - **Bypass Disclaimer**: Bypassing anti-cheat systems violates SkillRack's Terms of Use and your institution's academic honor codes.
>
> **Reverse-Engineering & Open-Source Context**: 
> OpenAI's official Codex CLI client is open-sourced under the Apache-2.0 License. [Thibault "Tibo" Sottiaux](https://x.com/thsottiaux) (Product Lead on the OpenAI Codex team) has publicly confirmed that users are allowed to use their accounts in custom or alternate agentic harnesses built on top of the open [Codex](https://github.com/openai/codex) repository. 
> 
> Specifically, following competitor harness restrictions in January 2026, Sottiaux [stated on X](https://x.com/thsottiaux/status/2009714843587342393) that OpenAI is *"100% invested in supporting a flourishing ecosystem of agentic coding tools"* and confirmed builders can build on the Codex repo directly. Sottiaux later [confirmed](https://x.com/thsottiaux/status/2009742187484065881) that they are actively working to allow Codex users to use their subscriptions in alternative harnesses like OpenCode directly. In May 2026, Sottiaux [shared](https://x.com/thsottiaux/status/2058071172361998482) that ~10% of their production traffic runs on third-party developer harnesses (like the Pi harness and OpenCode). We reverse-engineered the OAuth handshake (which listens on port `1455` for login callback parameters) and client endpoints directly from the open source codebase to build a local API bridge. However, utilizing this bridge to automate academic platforms or bypass proctored checks is unauthorized.
>
> <p align="center">
>   <img src="assets/Proof-Of-Harness.png" alt="OpenAI Codex Alternate Harness Confirmation" width="600">
> </p>

---

## What it does

| Feature | How |
|---------|-----|
| Tab switch detection | Spoofs `document.visibilityState` → always `visible` |
| Copy / paste / cut | Intercepts clipboard events before jQuery handlers run |
| Fullscreen enforcement | Intercepts `requestFullscreen()`, spoofs `fullscreenElement` |
| Multi-monitor detection | Spoofs `screen.left`, `screen.top`, `screen.isExtended` |
| Heartbeat / telemetry | Blocks XHR + Fetch to proctoring endpoints, returns fake 200s |
| ACE editor restrictions | Blocks `bte` command registration, overrides `cs()` diff check |
| Drag & drop | Strips `ondragstart`/`ondrop`/`onselectstart` from all elements |
| Captcha | Tesseract.js OCR on the math captcha image (auto-retry on fail) |
| AI solution | Generates code using one of 7 providers, fills the ACE editor |
| Auto Solver | Fully automated: captcha → AI → run → next problem |

---

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Firefox/Edge)
2. Click → **[Install Script](https://raw.githubusercontent.com/Vishnu-tppr/skillrack-script/refs/heads/main/Anti-Cheat%20Bypass%205.0.user.js)**
3. Tampermonkey will open the install page — click **Install**
4. Open SkillRack. Accept the disclaimer on first load.

The script auto-updates from GitHub (`@updateURL` is set in the header).

---

## Free AI via ChatGPT — no API key needed

This is the main reason to use this script. OpenAI charges ~$15/M tokens for API access. ChatGPT accounts get the same compute for free. The script uses your ChatGPT OAuth token to call `chatgpt.com/backend-api/codex` directly — the exact same model, zero cost.

It works in two modes. The script tries Mode 1 first and falls back automatically:

```
Mode 1: GM_xmlhttpRequest → chatgpt.com/backend-api/codex (browser-only)
         ↓ 401 / 403 / network error
Mode 2: http://127.0.0.1:10531/v1 (local npx openai-oauth proxy)
         ↓ proxy not running
Error: "Sign in or start npx openai-oauth"
```

### Setup (browser-only, no terminal)

**Step 1 — Install the "Sign in with ChatGPT" extension**

This extension intercepts OpenAI's OAuth callback at the browser level. No server required.

- Chrome: [Chrome Web Store](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
- Firefox: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/)
- Or load unpacked from `chrome-extension/` (developer mode)

Host permissions: `http://localhost:1455/*` only. Nothing leaves your device.

**Step 2 — Sign in**

<p align="left">
  <img src="assets/sign-in-with-chatgpt-button.png" alt="Sign in with ChatGPT button" width="220">
</p>

1. Open SkillRack → click ⚙️ (bottom-right)
2. Set **AI Provider** → **ChatGPT (openai-oauth)**
3. Click **Sign in with ChatGPT**
4. Login at OpenAI's page → extension intercepts the callback → shows "Continue to skillrack.com" → click Continue
5. Token saved in `localStorage` as `oai_oauth_session`

Done. No terminal, no API key.

**Step 3 — (Optional) Local proxy fallback**

If the direct call gets blocked (Cloudflare, token expiry, etc.):

```bash
npx openai-oauth@latest
```

Starts OpenAI-compatible endpoint at `127.0.0.1:10531/v1`. Models depend on your ChatGPT plan: `gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4-mini`, `gpt-image-2`.

Background commands:
```bash
npx openai-oauth --detach    # run in background
npx openai-oauth status
npx openai-oauth logs --follow
npx openai-oauth stop
npx openai-oauth login       # sign in without starting server
```

### How the OAuth flow works

![openai-oauth package structure](assets/package-structure.png)

```
Script → OAuthLogin.initiateLogin() → PKCE auth URL → auth.openai.com
  ↓
User logs in
  ↓
OpenAI redirects → http://localhost:1455/auth/callback?code=...&state=...
  ↓
Extension (declarativeNetRequest) intercepts → chrome-extension://.../confirm.html
  ↓
User clicks "Continue to skillrack.com"
  ↓
Page reloads with ?code=...&state=...&oo2_cb=1
  ↓
Script exchanges code → https://auth.openai.com/oauth/token via GM_xmlhttpRequest
  ↓
Token stored in localStorage → used as Bearer on chatgpt.com/backend-api/codex
```

---

## Other AI providers

| Provider | Cost | Notes |
|----------|------|-------|
| **ChatGPT (openai-oauth)** | Free | Your own account, no key |
| **DuckDuckGo AI** | Free | No account needed |
| **Google Gemini** | Free tier | Needs API key from [AI Studio](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | Free + paid | 300+ models, [get key](https://openrouter.ai/keys) |
| **G4F** | Free | [g4f.space](https://g4f.space) account |
| **OpenAI direct** | Paid | Standard API key |
| **YuppBridge** | Self-hosted | 200+ models via [YuppBridge](https://github.com/cloudWaddie/yuppbridge) |

### DuckDuckGo (zero setup)

Set provider to **DuckDuckGo AI**. Pick a model. That's it.

Available: GPT-4o Mini, GPT-5 Mini, GPT-OSS 120B, Llama 4 Scout, Claude 3.5 Haiku, Mixtral Small 3.

### OpenRouter

Fetches models dynamically from the API. 6-hour cache. Search by name, filter free-only. Default model: `google/gemini-2.0-flash:free`. Fallback: `openrouter/free`.

---

## Settings panel

Click ⚙️ bottom-right. All settings persist in `localStorage`.

**Bypasses**
| Setting | Default |
|---------|---------|
| Tab Detection Bypass | ✅ |
| Copy/Paste Bypass | ✅ |
| Fullscreen Bypass | ✅ |
| Multi-Monitor Bypass | ✅ |
| Block Telemetry | ✅ |

**Editor**
| Setting | Default |
|---------|---------|
| Drag & Drop | ✅ |
| Text Selection | ✅ |
| Context Menu | ✅ |

**Captcha**
| Setting | Default |
|---------|---------|
| Auto-Solve Captcha | ✅ |
| Username (for captcha parsing) | empty |

Set username if yours has `+` and numbers — e.g. `abcd123+21@xyz.com`.

**AI**
| Setting | Default |
|---------|---------|
| Enable AI Solver | ❌ |
| Auto Solver | ❌ |
| Provider | Gemini |

---

## Auto Solver

⚠️ Experimental.

With **AI Solver** + **Auto Solver** both enabled:

1. Waits for captcha to clear
2. Clicks the purple "🤖 AI Solution" button
3. Waits for generation, pastes into editor
4. Clicks Run
5. On success → next problem. On failure → retries (configurable max).

Click **STOP** to halt at any time.

---

## Captcha solver

Uses Tesseract.js (loaded via `@require`). Inverts the captcha image for better OCR accuracy. Detects the captcha image dynamically — works across different SkillRack page layouts.

First run takes a few seconds while Tesseract initialises. Subsequent runs are fast.

---

## ACE editor bypass details

SkillRack uses multiple layers to block copy/paste in the code editor:

| What SkillRack does | What the script does |
|---------------------|----------------------|
| `commands.addCommand({name:'bte', bindKey:'ctrl-c\|ctrl-v\|...'})` | Blocks `addCommand` calls with key `bte` |
| `commands.on("exec", ...)` paste block | Drops exec handlers that reference paste |
| `container.addEventListener("drop", ...)` | Adds working drop handler at capture phase |
| Anti-bulk-paste (resets editor if 30+ chars pasted) | Intercepts `setValue()` and change handlers |
| `cs()` diff check | Overrides to always sync code |

The script intercepts `ace.edit()` before SkillRack's code runs (`@run-at document-start`), so all of this happens before restrictions are applied.

---

## MFIB — Multiple Fill In the Blank

Some SkillRack problems have multiple inline blanks (`[BLANK_0]`, `[BLANK_1]`, ...) mixed with static code.

The script:
1. Parses the template, identifies each blank
2. Sends a structured JSON prompt to the AI
3. Parses the JSON array response
4. Fills each input field with proper browser events (so the React/Angular framework registers the change)

---

## Startup sequence

```
document-start: all event interceptors installed
  ↓
Kill switch check: fetches kill.txt from GitHub
  ↓ (if true)
Update check: compares @version against GitHub
  ↓ (if current)
Disclaimer modal (first run only, saved in localStorage)
  ↓ (accepted)
UI initialised: settings panel, AI button, captcha solver
```

---

## Kill switch

The script checks `kill.txt` in this repo on every load.

- `true` → runs normally
- `false` → shows "Script Disabled" and stops

Used for emergencies (e.g. if SkillRack patches something that breaks the bypass badly).

---

## Troubleshooting

**Clipboard still blocked**
Check console for "Blocked" — means a jQuery handler ran before the script. Confirm `@run-at document-start` is set in Tampermonkey's script settings.

**ACE editor blank / `getSession is not a function`**
Usually means the editor loaded before the interception. Try force-refreshing (Ctrl+Shift+R).

**Captcha not solving**
Wait 3-5 seconds on first run (Tesseract download). If it loops, close and reopen the tab.

**ChatGPT provider not working**
- Extension not installed? → [Chrome](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna) / [Firefox](https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/)
- Token expired? → re-sign in from Settings
- Getting 403? → OpenAI may have patched the endpoint. [File an issue](https://github.com/Vishnu-tppr/Skillrack-Script/issues).
- Still blocked? → run `npx openai-oauth@latest` as proxy fallback

**OpenRouter models not loading**
Click the 🔄 button in the model selector. Models cache for 6 hours.

---

## Disclaimer

This script is provided as-is. Using it may violate SkillRack's terms of service and your institution's academic integrity policies. You are responsible for how you use it.

The ChatGPT integration uses [openai-oauth](https://github.com/EvanZhouDev/openai-oauth), an unofficial community project. It is not affiliated with or endorsed by OpenAI. You must comply with OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/).

**Disable this script during actual tests.**

---

## Changelog

### v5.0f
- ChatGPT provider via openai-oauth (browser-only, no API key)
- `GM_xmlhttpRequest` direct call to `chatgpt.com/backend-api/codex`
- Auto-fallback to `npx openai-oauth` proxy on 401/403

### v5.1
- Multiple Fill In the Blank (MFIB) with JSON prompt/response
- `window.ace` interception rewritten (fixes blank editor bug)
- Run-only AutoSolver (no Submit click)
- OpenRouter: `gemini-2.0-flash:free` default, `openrouter/free` fallback

### v5.0
- C/C++ language tag and comment stripping
- Code similarity check before submit
- YuppBridge provider (200+ models)
- DuckDuckGo AI provider (free, no key)

### v4.6
- Mandatory update check with blocking dialog
- First-time disclaimer
- Remote kill switch via `kill.txt`

### v4.5
- Dynamic OpenRouter model loading (API-fetched, 6h cache)
- Free-only model filter
- Auto Solver stop button

### v4.4
- G4F provider
- Auto Solver (experimental)

---

## Credits

- **[ToonTamilIndia](https://github.com/ToonTamilIndia)** — main development
- **[adithyagenie](https://github.com/adithyagenie/skillrack-captcha-solver)** — captcha solver
- **[EvanZhouDev/openai-oauth](https://github.com/EvanZhouDev/openai-oauth)** — openai-oauth SDK (Apache-2.0)
- **[vishnu-tppr](https://github.com/vishnu-tppr)** — ChatGPT integration & reverse engineering

---

MIT License
