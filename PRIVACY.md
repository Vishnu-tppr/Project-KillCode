# Privacy Policy

This project consists of the Anti-Cheat Bypass userscript and the bundled "Sign in with ChatGPT" browser extension. We do not collect, track, or share your personal data. 

---

## 1. Userscript Privacy

### Local Data Storage
All configurations, API keys, and session tokens remain on your machine inside the browser's local storage (`localStorage` and `IndexedDB`).
- **Bypass Toggles**: Settings representing which anti-cheat features are enabled.
- **ChatGPT Session Token**: The OAuth access token (`oai_oauth_session`) is saved in your browser's local storage to authenticate requests to `chatgpt.com`.
- **API Keys**: Keys for Gemini, OpenAI, or OpenRouter are saved as plaintext in local storage.

### Outbound Network Connections
The script only connects to the following external domains:
- **AI Providers**: Code snippets, problem descriptions, and input templates are sent directly to the AI provider you select (e.g., `chatgpt.com`, `api.openai.com`, `openrouter.ai`, `aistudio.google.com`).
- **GitHub**: Checks `raw.githubusercontent.com` on startup to fetch `kill.txt` (remote kill switch) and read the latest version tag.
- **Localhost**: Connects to `127.0.0.1:10531` if you use the local `npx openai-oauth` proxy fallback.

### Captcha Solver
Captcha images are processed locally in your browser using `Tesseract.js`. No images, math challenges, or OCR results are sent to any external server.

### Telemetry Blocking
The script blocks network requests from SkillRack to its proctoring and telemetry endpoints. This stops the platform from transmitting your focus status, window size, page switches, or keystroke timing data.

---

## 2. "Sign in with ChatGPT" Extension Privacy

The Chrome/Firefox extension is used only to complete the sign-in flow for the ChatGPT provider.

> **Chrome Web Store Data Usage Disclosure:**
>
> Sign in with ChatGPT has disclosed the following information regarding the collection and usage of your data. More detailed information can be found in the developer's privacy policy.
>
> Sign in with ChatGPT handles the following:
> - **Authentication information**: For example: passwords, credentials, security question, or personal identification number (PIN)
>
> This developer declares that your data is:
> - **Not being sold to third parties**, outside of the approved use cases.
> - **Not being used or transferred** for purposes that are unrelated to the item's core functionality.
> - **Not being used or transferred** to determine creditworthiness or for lending purposes.


### Redirect Mechanism
OpenAI's OAuth callback returns to `http://localhost:1455/auth/callback`. The extension uses a declarative net request rule to intercept this callback and redirect it to a local confirmation screen:
`chrome-extension://<extension-id>/src/confirm.html`

### Callback Handling
- **Temporary Handling**: The extension temporarily reads OAuth parameters (`code` and `state`) and the redirection URL.
- **No Storage**: This data is never saved to extension storage or history.
- **No External Servers**: The callback parameters are not transmitted to any third-party or developer-controlled server. They are returned only to `skillrack.com` after you click "Continue".

### Extension Permissions
- **Host Permission**: Requests access only to `http://localhost:1455/*`.
- **What it does NOT read**: The extension does not read your ChatGPT chat history, account passwords, browser history, or webpage contents.
- **No Monetization**: The extension does not sell data, serve ads, or run trackers.

---

## Legal & Contact

This project is unofficial, community-maintained, and is not affiliated with, endorsed by, or sponsored by OpenAI, Inc. or SkillRack.

For questions or security concerns, open an issue on our [GitHub Issues](https://github.com/Vishnu-tppr/Skillrack-Script/issues).
