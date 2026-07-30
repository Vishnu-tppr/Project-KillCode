# Anti-Cheat Bypass Userscript

<p align="center">
  <img src="assets/KillCode.jpeg" alt="KillCode Script Icon" width="120">
</p>

Tampermonkey/Greasemonkey userscript for SkillRack. Bypasses anti-cheat restrictions and generates AI solutions using your own ChatGPT account — no API key needed.

## ⚠️ Important Warnings

> **⚠️ Disable the script during an actual test. It may cause unintended behaviour.**

> **⚠️ Don't navigate while the captcha solver is running. If it loops, close and reopen the tab.**

---

## Version 5.0f (Latest)

### 🆕 v5.0f — Free ChatGPT AI via openai-oauth

The script integrates with [openai-oauth](https://github.com/EvanZhouDev/openai-oauth), which reuses the same OAuth tokens as OpenAI's Codex CLI to call `chatgpt.com/backend-api/codex` — the same compute OpenAI charges API credits for, accessed through your free ChatGPT account.

#### Two Modes

| Mode | How it works | Requires |
|------|-------------|----------|
| **Direct Browser** | `GM_xmlhttpRequest` → `chatgpt.com/backend-api/codex` using your stored OAuth token | Chrome extension + sign-in |
| **Local Proxy Fallback** | Routes through `npx openai-oauth` on your machine at `127.0.0.1:10531` | Node.js + terminal |

The script tries direct first. On any failure (401, 403, network), it falls back to the local proxy automatically.

---

### 🔧 Setup: ChatGPT Provider

#### Step 1 — Install the browser extension

- **Chrome**: [Sign in with ChatGPT](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/)

The extension's only host permission is `http://localhost:1455/*`. It relays OpenAI's OAuth callback — no credentials go to any third-party server.

#### Step 2 — Sign in

1. Open Settings (⚙️ bottom-right), select **"🤖 ChatGPT (openai-oauth)"** as provider.
2. Click **"Sign in with ChatGPT"**.
3. Complete the OAuth popup. Token is stored in IndexedDB, encrypted with WebCrypto.

#### Step 3 — (Optional) Local proxy

If the direct call is blocked, run the proxy in a terminal:

```bash
npx openai-oauth@latest
```

Starts an OpenAI-compatible endpoint at `http://127.0.0.1:10531/v1`. Models available depend on your ChatGPT plan: `gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-image-2`, etc.

Background mode:

```bash
npx openai-oauth --detach
npx openai-oauth status
npx openai-oauth logs --follow
npx openai-oauth stop
```

Sign in without starting the server:

```bash
npx openai-oauth login
```

---

#### How it works end-to-end

![openai-oauth SDK package structure](assets/package-structure.png)

```
Script (in browser)
        ↓
GM_xmlhttpRequest → chatgpt.com/backend-api/codex
        ↓ (if 401/403/network error)
Fallback → http://127.0.0.1:10531/v1/chat/completions
        ↓ (if proxy not running)
Error shown: "Sign in or start npx openai-oauth"
```

---

### 🆕 v5.1 — Multiple Fill In the Blank & Stability

#### 🧩 Multiple Fill In the Blank (MFIB)
- Parses templates with multiple blanks (`[BLANK_0]`, `[BLANK_1]`, etc.) mixed with static code.
- Sends a structured JSON prompt; AI returns a JSON array of answers.
- Autofills all inputs with proper browser events so the framework registers them.

#### 🔧 Code Editor Fixes
- Refactored `window.ace` interception using a local variable closure. Fixes blank editor and `getSession is not a function` errors.
- Falls back to native `<textarea>` if Ace fails to load.

#### ⚡ AutoSolver (Run-Only)
- Runs code against sample cases then moves to the next problem — no Save/Submit click needed.
- Clears previous results and growl popups before each run to avoid stale detection.

#### 🔌 OpenRouter Model Updates
- Default: `google/gemini-2.0-flash:free`
- Fallback: `openrouter/free` (auto-selects any active free model on rate limits)

---

## Version 5.0

#### 🔄 Pre/Post Code Support
- When **disabled**: full code (pre + middle + post) sent to AI.
- When **enabled**: only middle code sent (useful for function-fill tasks).

#### 📋 YuppBridge (200+ Models)
Self-hosted OpenAI-compatible proxy backed by Yupp AI.

- Requires your own instance: [YuppBridge GitHub](https://github.com/cloudWaddie/yuppbridge)
- Dynamic model loading with search and 6-hour cache
- Endpoints: `/health`, `/v1/models`, `/v1/chat/completions`, `/dashboard`, `/api/v1/credits`, `/metrics`
- Models: GPT-4o, Claude, Gemini, Llama, Mistral, DeepSeek, Qwen, and more

#### 🦆 DuckDuckGo AI (FREE)
No account, no API key. Uses a Cloudflare Workers proxy to bypass CSP.

Available models: GPT-4o Mini, GPT-5 Mini, GPT-OSS 120B, Llama 4 Scout, Claude 3.5 Haiku, Mixtral Small 3.

---

## Previous Updates (v4.6–4.9)

#### 🔄 Mandatory Update Check
Compares your version against GitHub on load. Shows a blocking dialog if you're behind — click "Update Now" to go to the script URL.

#### ⚖️ First-Time Disclaimer
One-time modal on first run. Must accept before the script initialises. Covers academic penalties, account termination, and legal consequences.

#### 🚫 Remote Kill Switch
Checks `kill.txt` on GitHub. If `false`, shows "Script Disabled" and stops. Used for emergencies and maintenance.

---

## Settings Panel

Click the **⚙️ gear button** (bottom-right) to open settings. All changes save to localStorage and take effect on page reload.

### Anti-Cheat Bypasses
| Setting | Description | Default |
|---------|-------------|---------|
| Tab Detection Bypass | Prevent tab switch detection | ✅ On |
| Copy/Paste Bypass | Enable clipboard in code editor | ✅ On |
| Fullscreen Bypass | Skip fullscreen enforcement | ✅ On |
| Multi-Monitor Bypass | Block monitor detection | ✅ On |
| Block Telemetry | Block heartbeat requests | ✅ On |

### Editor Features
| Setting | Description | Default |
|---------|-------------|---------|
| Drag & Drop | Enable drag & drop text | ✅ On |
| Text Selection | Enable text selection | ✅ On |
| Context Menu | Enable right-click menu | ✅ On |

### Captcha Solver
| Setting | Description | Default |
|---------|-------------|---------|
| Auto-Solve Captcha | Automatically solve math captcha | ✅ On |
| Username (optional) | For captcha parsing (e.g. `abc+21@xyz`) | (empty) |

### AI Solution Generator
| Setting | Description | Default |
|---------|-------------|---------|
| Enable AI Solver | Show AI solution button | ❌ Off |
| ⚡ Auto Solver | Auto-solve & submit (experimental) | ❌ Off |
| AI Provider | 7 providers (see below) | Gemini |
| Gemini API Key | Google Gemini API key | (empty) |
| OpenAI API Key | OpenAI API key | (empty) |
| OpenRouter API Key | OpenRouter API key | (empty) |
| OpenRouter Model | Dynamic model selector with search | Gemini 2.0 Flash |
| G4F API Key | G4F API key | (empty) |
| G4F Model | Dynamic model selection | Auto |
| DuckDuckGo Model | 6 free models | GPT-4o Mini |
| DuckDuckGo API URL | Custom proxy URL | (default) |
| YuppBridge API URL | Self-hosted YuppBridge URL | (empty) |
| YuppBridge API Key | YuppBridge API key | (empty) |
| YuppBridge Model | 200+ models | gpt-4o |
| ChatGPT (openai-oauth) | Sign in with ChatGPT — free AI | Sign In button |

---

## AI Providers

### 🤖 ChatGPT via openai-oauth — FREE ⭐

![Sign in with ChatGPT button](assets/sign-in-with-chatgpt-button.png)

1. Install [Sign in with ChatGPT](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
2. Set provider to **"🤖 ChatGPT (openai-oauth)"**
3. Click **"Sign in with ChatGPT"** — OAuth flow, token stored locally
4. Done. Script calls `chatgpt.com/backend-api/codex` directly.

> Optional: run `npx openai-oauth@latest` in a terminal for automatic fallback to `http://127.0.0.1:10531`.

Models: `gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4-mini`, `gpt-image-2` (varies by plan).

### Google Gemini (Free)
1. [Get API key](https://aistudio.google.com/app/apikey)
2. Paste under "Gemini API Key" in settings

### OpenAI (Paid)
1. [Get API key](https://platform.openai.com/api-keys)
2. Paste under "OpenAI API Key", set provider to "OpenAI (ChatGPT)"

### OpenRouter (Free & Paid) ⭐
1. [Get API key](https://openrouter.ai/keys)
2. Paste under "OpenRouter API Key", set provider to "OpenRouter (Multi-Model)"
3. Browse models — check "Show free only" to filter

Popular free models:

| Model | Provider | Notes |
|-------|----------|-------|
| Gemini 2.0 Flash | Google | Fast, general |
| DeepSeek R1 | DeepSeek | Reasoning |
| Qwen3 Coder 480B | Qwen | Coding |
| Llama 3.3 70B | Meta | General |
| Claude 3 Haiku | Anthropic | Fast |

### G4F (g4f.space)
1. [Get API key](https://g4f.space)
2. Paste under "G4F API Key", set provider to "G4F"
3. Pick a model or use "Auto"

### DuckDuckGo AI — FREE, no key needed ⭐
Set provider to "🦆 DuckDuckGo AI (FREE!)" and pick a model. That's it.

| Model | Provider |
|-------|----------|
| GPT-4o Mini | OpenAI |
| GPT-5 Mini | OpenAI |
| GPT-OSS 120B | OpenAI |
| Llama 4 Scout | Meta |
| Claude 3.5 Haiku | Anthropic |
| Mixtral Small 3 | Mistral AI |

Self-host the proxy: clone `duckduckgo-api`, run `npm install && wrangler deploy`, update the URL in settings.

### YuppBridge (200+ Models, Self-Hosted) ⭐ Power Users

1. Deploy from [YuppBridge GitHub](https://github.com/cloudWaddie/yuppbridge)
2. Set provider to "🌉 YuppBridge (200+ Models)"
3. Enter your URL and API key
4. Click 🔄 to load models, ❤️ for health check

Endpoints: `/health`, `/v1/models`, `/v1/chat/completions`, `/dashboard`, `/api/v1/credits`, `/metrics`, `/api/v1/config/reload`

Popular models: gpt-4o, gpt-4o-mini, claude-3-opus, claude-3-sonnet, gemini-1.5-pro, llama-3-70b, mistral-large, deepseek-coder.

---

## AI Solution Generator

- Works on tutorial pages (fills middle code) and code track pages (full solution)
- Purple "🤖 AI Solution" button appears next to Save/Run
- Supports 7 providers (see above)

Dynamic OpenRouter model loading (v4.5+): fetches from API, caches 6 hours, groups by provider, lets you search and filter free-only models.

---

## Auto Solver

⚠️ **Experimental — use at your own risk**

Enable "Enable AI Solver" + "⚡ Auto Solver" in settings. The solver:

1. Waits for captcha (if present)
2. Clicks AI Solution, waits for generation
3. Runs code, reads result
4. Proceeds to next problem on success, retries on failure (configurable)

**Click STOP at any time to halt.**

---

## Auto Captcha Solver

Credit: [adithyagenie](https://github.com/adithyagenie/skillrack-captcha-solver)

Uses Tesseract.js OCR. Inverts image colors for better accuracy. Dynamic captcha image detection — works across different pages. If your username has `+` and numbers (e.g. `abcd123+21@xyz`), set it in settings for parsing.

---

## Bypass Details

### 1. Tab Switch Detection
- `document.visibilityState` always returns `'visible'`
- `document.hidden` always returns `false`
- `visibilitychange` listeners blocked

### 2. Copy/Paste/Cut
- Clipboard events intercepted at capture phase (runs before jQuery)
- Ctrl+C/V/X/Z work in the code editor
- `$.fn.bind()` and `$.fn.on()` patched to drop clipboard bindings
- Native Clipboard API restored

### 3. Drag & Drop
- `ondragstart`, `ondrop`, `onselectstart` removed from `<body>` and all elements
- Runs on load and on a periodic timer

### 4. Text Selection
- CSS: `user-select: text !important` on all elements
- `selectstart` prevention blocked
- Right-click context menu restored

### 5. ACE Editor

| What SkillRack does | How it's bypassed |
|---------------------|-------------------|
| `commands.addCommand({name:'bte', bindKey:'ctrl-c\|ctrl-v\|...'})` | Blocks command registration |
| `commands.on("exec",...)` paste block | Filters exec handlers |
| `container.addEventListener("drop",...)` | Adds working drop handler at capture phase |
| Anti-bulk-paste (30+ char reset) | Intercepts `setValue()` and change handlers |
| `cs()` diff check | Overrides to always sync |

### 6. Fullscreen
- `requestFullscreen()` and `exitFullscreen()` intercepted
- `document.fullscreenElement` always returns a truthy value

### 7. Multi-Monitor Detection
- `window.screen.left/top` spoofed to 0, `isExtended` to false
- Mouse movement normalised

### 8. Heartbeat / Telemetry
- XHR and Fetch intercepted
- Proctoring endpoint requests blocked, fake 200 responses returned

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://www.greasespot.net/)
2. Create a new userscript
3. Paste the contents of `Anti-Cheat Bypass 5.0.user.js`
4. Save and enable
5. Accept the disclaimer on first run
6. Set up your AI provider in Settings

---

## How It Works

### Startup flow

```
Script loads
     ↓
Kill switch check (GitHub kill.txt)
     ↓ enabled
Update check
     ↓ up to date
Disclaimer (first run only)
     ↓ accepted
All features initialised
```

### ChatGPT (openai-oauth) flow

```
"Sign in with ChatGPT" clicked
        ↓
OAuth popup → chatgpt.com login
        ↓
Extension relays callback → token saved in IndexedDB (encrypted)
        ↓
AI Solution requested
        ↓
GM_xmlhttpRequest → chatgpt.com/backend-api/codex/responses
        ↓ on failure
Fallback → http://127.0.0.1:10531 (npx openai-oauth)
```

### Event interception

```
User presses Ctrl+V
        ↓
Capture phase (our handler runs first)
  → stopImmediatePropagation()
  → clipboard action proceeds
        ↓
Bubbling phase (site jQuery handlers)
  → never reached
```

### ACE editor override

```
Site: txtCode.commands.addCommand({name:'bte', bindKey:'ctrl-c|ctrl-v'...})
        ↓
Script intercepts ace.edit() first
        ↓
Blocks 'bte' registration
        ↓
Shortcuts work normally
```

### Dynamic model loading (OpenRouter)

```
Settings opened
        ↓
Fetch from OpenRouter API
        ↓
Cache 6 hours
        ↓
Group by provider (free first)
        ↓
Search & filter enabled
```

---

## Troubleshooting

### Script not loading
- Check if you accepted the disclaimer
- Check browser console for kill switch messages
- Make sure you're on the latest version

### Clipboard not working
- Check console for "Blocked" messages
- Confirm `@run-at document-start` is set
- Refresh after enabling

### ACE editor bypass not working
- Check console for bypass status messages
- Editor might load dynamically — try increasing timeouts

### Captcha solver not working
- Wait for Tesseract.js to load (first run takes a few seconds)
- Check console for "Captcha elements not found"
- If looping, close and reopen the tab

### AI Solution not appearing
- Check API key is set (or signed in for ChatGPT provider)
- Check that the problem description is visible on the page
- Look for errors in browser console

### OpenRouter models not loading
- Click 🔄 refresh
- Check internet connection
- 6-hour cache — wait or force refresh

### Auto Solver stuck
- Click **STOP**
- Check console for errors
- Increase delay settings

### ChatGPT (openai-oauth) not working
- Confirm [Sign in with ChatGPT](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna) is installed
- Re-sign in from Settings if token expired
- Optional: run `npx openai-oauth@latest` as proxy fallback
- Check console for `[openai-oauth]` errors
- `403` or CORS error = OpenAI patched the endpoint. File an issue.

---

## Remote Kill Switch

`kill.txt` on GitHub controls the switch:
- `true` — script runs normally
- `false` — script disabled, shows message

Used for emergencies, maintenance, and security incidents.

---

## Disclaimer

⚠️ **Read before use:**

- Provided "AS IS" with no warranty.
- The author is **not responsible** for academic penalties, account suspension, legal consequences, or damage to your record.
- Bypassing anti-cheat may violate your institution's academic integrity policies.
- You are **solely responsible** for how you use this.
- For educational purposes only.
- The openai-oauth integration is unofficial and **not affiliated with OpenAI**. You must comply with OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) and [Usage Policies](https://openai.com/policies/usage-policies/). Use only your own ChatGPT account.

**⚠️ Disable during actual tests and exams.**

---

## Changelog

### v5.0f
- 🤖 ChatGPT (openai-oauth) provider — free AI via your own account
- ⚡ Direct browser mode via `GM_xmlhttpRequest` to `chatgpt.com/backend-api/codex`
- 🔄 Auto-fallback to `npx openai-oauth` proxy on failure
- 🎨 Extension footer with GitHub credit (@vishnu-tppr)

### v5.1
- ✨ Multiple Fill In the Blank (MFIB) — JSON prompt/response
- 🔧 `window.ace` interception rewritten (fixes blank editor)
- ⚡ Run-only AutoSolver with stale result prevention
- 🔌 OpenRouter: Gemini 2.0 Flash default, `openrouter/free` fallback

### v5.0
- 🔧 C/C++ language tag and comment stripping fixed
- 🛡️ Code similarity checks and empty response validation
- 📋 YuppBridge provider (200+ models)
- 🦆 DuckDuckGo AI provider (completely free)

### v4.6
- ✨ Mandatory update check
- ✨ First-time disclaimer
- ✨ Remote kill switch
- 🔧 Startup flow refactor

### v4.5
- ✨ Dynamic OpenRouter model loading
- ✨ Model search and free-only filter
- ✨ 6-hour model cache
- 🔧 Auto Solver stop button fixed

### v4.4
- ✨ G4F provider
- ✨ Auto Solver (experimental)
- 🔧 Various fixes

### v4.3
- ✨ OpenRouter integration (30+ models)
- ✨ Custom model ID support

### v4.2
- ✨ Captcha solver improvements
- 🔧 Dynamic captcha image detection

### v4.1
- ✨ Settings panel
- ✨ AI Solution Generator
- ✨ Multi-provider support

---

## License

MIT

## Credits

- **ToonTamilIndia** — main development
- **[adithyagenie](https://github.com/adithyagenie/skillrack-captcha-solver)** — captcha solver
- **[EvanZhouDev/openai-oauth](https://github.com/EvanZhouDev/openai-oauth)** — openai-oauth SDK (Apache-2.0)
- **[@vishnu-tppr](https://github.com/vishnu-tppr)** — ChatGPT integration & reverse engineering
