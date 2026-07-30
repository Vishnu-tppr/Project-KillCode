# Security Policy

## Supported Versions

Only the latest release gets security updates.

| Version | Supported |
|---------|-----------|
| 5.0f+   | Yes       |
| < 5.0f  | No        |

---

## Remote Kill Switch

The script checks `kill.txt` in the GitHub repository on every load.
If the remote text file contains `false`, the script shuts down immediately.
This is designed to stop execution if a critical vulnerability is found or if the anti-cheat bypass triggers account bans.

---

## Token and API Key Security

All API keys and session tokens are stored directly in your browser's local storage (`localStorage` and `IndexedDB`).

- **No external server**: Your tokens or API keys are never sent to a middleman server.
- **Direct connections**: The script only makes direct requests to the AI providers you select (e.g., OpenAI, Google, OpenRouter).
- **Extension isolation**: The "Sign in with ChatGPT" extension only requests permission for `localhost:1455/*`. It intercepts the OAuth code callback and redirects it back to SkillRack. Your password or primary account session is never read by the extension.

---

## Reporting Vulnerabilities

If you find a security issue or credential leak risk:

1. Open a GitHub Issue in the repository.
2. Clearly describe the issue and how to reproduce it.
3. Do not include your own API keys or tokens in the issue text.
