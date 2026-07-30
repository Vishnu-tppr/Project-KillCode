# Sign in with ChatGPT — Setup Guide

## Option A: Install from Chrome Web Store (Easiest — Recommended)

1. Open this link in Chrome:  
   [Install "Sign in with ChatGPT"](https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna)
2. Click **Add to Chrome**
3. Done — the script will automatically detect it ✅

---

## Option B: Load Unpacked (Developer Mode — No Web Store)

Load the extension directly from your local folder:

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select this folder:  
   `d:\KillCode\openai-oauth\apps\chrome-extension`
5. Done — the userscript will automatically detect the unpacked extension on SkillRack ✅


---

## Signing In (Browser-Only — No Terminal Required)

Once the extension is installed:

1. Open SkillRack and click the **⚙ Settings** button in the bypass panel
2. Go to **AI Provider → OpenAI / ChatGPT**
3. Make sure **Sign in with ChatGPT** tab is selected
4. Click the **"Sign in with ChatGPT"** button
5. OpenAI's login page opens — sign in with your ChatGPT account
6. The extension intercepts the callback and shows a **"Continue to skillrack.com"** confirmation
7. Click **Continue** — you're redirected back and **signed in** ✅

Your access token is stored in the browser (localStorage). No terminal, no API key, no npx needed.

---

## How It Works (Full Architecture)

```
User clicks "Sign in with ChatGPT" in the script Settings panel
  ↓
OAuthLogin.initiateLogin() builds a PKCE auth URL → navigates to auth.openai.com
  ↓
User logs in with their ChatGPT account at OpenAI
  ↓
OpenAI redirects to http://localhost:1455/auth/callback?code=...&state=...
  ↓
The Chrome extension intercepts this URL (via declarativeNetRequest dynamic rule)
  and redirects to: chrome-extension://<ID>/src/confirm.html#<original-url>
  ↓
confirm.html reads the state, shows "Continue to skillrack.com with ChatGPT"
  ↓
User clicks Continue → redirected back to SkillRack with ?code=...&state=...&oo2_cb=1
  ↓
Script (OAuthLogin.handleCallbackIfPresent) detects oo2_cb=1,
  exchanges code for access_token via gmFetch → https://auth.openai.com/oauth/token
  ↓
Token stored in localStorage (oai_oauth_session)
  ↓
AI requests go directly to chatgpt.com/backend-api/codex using the Bearer token 🎉
```

**Why it works without a server:** The Chrome extension intercepts the `localhost:1455` redirect at the browser level using `declarativeNetRequest`. No server needed, no credentials leave your device.

---

## Files in This Extension

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config — `externally_connectable` for skillrack.com, `host_permissions` for localhost:1455 |
| `background.js` | Installs dynamic DNR rule (works with any extension ID, not just Web Store) + responds to ping |
| `src/confirm.html` | Confirmation page shown after login — "Continue to skillrack.com" |
| `src/confirm.js` | Reads state, creates relay URL, handles Continue / Cancel |
| `src/installed.json` | Lets the script detect the extension via a direct fetch |
