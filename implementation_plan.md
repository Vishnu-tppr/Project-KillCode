# Implementation Plan: Integrate NVIDIA NIM as AI Provider and Sync Dropdown UI

This plan describes how we integrated the NVIDIA NIM AI provider (utilizing the OpenAI-compatible `https://integrate.api.nvidia.com/v1` API endpoint) and synced the "Find Incomplete" dropdown UI across both userscripts.

> **References:**
> - Model catalog: [https://build.nvidia.com/models](https://build.nvidia.com/models)
> - Official API docs: [https://docs.api.nvidia.com/nim/reference/llm-apis](https://docs.api.nvidia.com/nim/reference/llm-apis)

---

## NVIDIA NIM — Free Endpoint Models (77 total, key ones below)

### 🟢 LLMs — Chat Completions (OpenAI-Compatible POST)

All these use **`POST https://integrate.api.nvidia.com/v1/chat/completions`**.

| Model ID                                 | Publisher  | Tags                       | Context |
| ---------------------------------------- | ---------- | -------------------------- | ------- |
| `z-ai/glm-5.2`                           | Z.ai       | Agentic, Coding, Reasoning | 16K     |
| `nvidia/nemotron-3-ultra-550b-a55b`      | NVIDIA     | Agent, MoE, Tool Calling   | 1M      |
| `nvidia/nemotron-3-super-120b-a12b`      | NVIDIA     | MoE, Coding, Planning      | 1M      |
| `nvidia/nemotron-3-nano-30b-a3b`         | NVIDIA     | MoE, Coding, Tool Calling  | 1M      |
| `deepseek-ai/deepseek-v4-flash`          | DeepSeek   | MoE, Coding, Agents        | 1M      |
| `deepseek-ai/deepseek-v4-pro`            | DeepSeek   | MoE, Coding                | 1M      |
| `moonshotai/kimi-k2.6`                   | Moonshot   | Multimodal MoE, Agentic    | —       |
| `minimaxai/minimax-m2.7`                 | Minimaxai  | Coding, Reasoning          | —       |
| `minimaxai/minimax-m3`                   | Minimaxai  | Multimodal MoE, Vision     | —       |
| `mistralai/mistral-medium-3.5-128b`      | Mistral AI | Text Gen, Coding, Agentic  | 128K    |
| `mistralai/mistral-small-4-119b-2603`    | Mistral AI | Hybrid MoE, Multimodal     | 256K    |
| `qwen/qwen3.5-122b-a10b`                 | Qwen       | Tool Calling, Coding       | —       |
| `qwen/qwen3.5-397b-a17b`                 | Qwen       | MoE, Vision, RAG           | —       |
| `stepfun-ai/step-3.7-flash`              | StepFun    | MoE, Coding, Agentic       | —       |
| `stepfun-ai/step-3.5-flash`              | StepFun    | Agentic Reasoning          | —       |
| `nvidia/nemotron-3.5-content-safety`     | NVIDIA     | Safety, Multilingual       | —       |
| `nvidia/gliner-pii`                      | NVIDIA     | PII Detection              | —       |
| `nvidia/riva-translate-4b-instruct-v1_1` | NVIDIA     | Translation, 12 Languages  | —       |

### 🟢 Multimodal / Visual — POST + Async GET

These models use **`POST` for inference + `GET` for async polling** when the response returns HTTP 202:

| Model ID                                        | Type                            | POST Endpoint          |
| ----------------------------------------------- | ------------------------------- | ---------------------- |
| `google/gemma-4-31b-it`                         | VLM, Reasoning                  | `/v1/chat/completions` |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | Omni-modal (image/video/speech) | `/v1/chat/completions` |
| `nvidia/nemotron-3.5-content-safety`            | Multimodal Safety               | `/v1/chat/completions` |
| `google/diffusiongemma-26b-a4b-it`              | Diffusion LLM                   | `/v1/chat/completions` |
| `nvidia/ising-calibration-1-35b-a3b`            | Quantum VLM                     | `/v1/chat/completions` |

---

## API Request Formats

### GET — List Models

```http
GET https://integrate.api.nvidia.com/v1/models
Authorization: Bearer $NVIDIA_API_KEY
```

### POST — Chat Completion (Standard / Streaming)

```http
POST https://integrate.api.nvidia.com/v1/chat/completions
Authorization: Bearer $NVIDIA_API_KEY
Content-Type: application/json

{
  "model": "z-ai/glm-5.2",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Your prompt here"}
  ],
  "temperature": 0.7,
  "top_p": 1,
  "max_tokens": 4096,
  "stream": true
}
```

### GET — Async Status Poll (for models returning HTTP 202)

Some larger models (e.g. `kimi-k2.6`, `gemma-4-31b-it`, `mistral-medium-3.5-128b`) return `202 Accepted` with a request ID instead of an immediate response:

```http
GET https://integrate.api.nvidia.com/v1/status/{request_id}
Authorization: Bearer $NVIDIA_API_KEY
```

### POST — Embeddings

```http
POST https://integrate.api.nvidia.com/v1/embeddings
Authorization: Bearer $NVIDIA_API_KEY
Content-Type: application/json

{
  "input": "Your text here",
  "model": "nvidia/llama-nemotron-embed-1b-v2",
  "encoding_format": "float"
}
```

### Python (OpenAI SDK — works for all LLM models)

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["NVIDIA_API_KEY"]
)

# Streaming
completion = client.chat.completions.create(
    model="z-ai/glm-5.2",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.7,
    max_tokens=4096,
    stream=True
)
for chunk in completion:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")

# Non-streaming
response = client.chat.completions.create(
    model="nvidia/nemotron-3-super-120b-a12b",
    messages=[{"role": "user", "content": "Explain MoE architecture"}],
    stream=False
)
print(response.choices[0].message.content)
```

---

## Key Notes for Integration

* **141 total models**, **77 with free endpoints** as of July 2026.
* **Async pattern:** Models like `kimi-k2.6`, `gemma-4-31b-it`, `mistral-medium-3.5-128b`, `qwen3.5-397b-a17b`, and `diffusiongemma-26b-a4b-it` may return HTTP `202` — your code must poll `GET /v1/status/{id}` until complete.
* **Base URL:** `https://integrate.api.nvidia.com/v1` — no model-specific URLs needed.
* **Free API key:** Get it at **[https://build.nvidia.com](https://build.nvidia.com)** → any model → **Generate API Key**.
* **⚠️ Deprecation alert:** `nvidia/nemotron-3-content-safety` and `nvidia/nemotron-content-safety-reasoning-4b` are being deprecated soon — avoid using these in new builds.

---

## Proposed Changes (Implemented)

### AI Provider: NVIDIA NIM

Integrated NVIDIA NIM as a new AI provider option in settings. Supports dynamic model fetching, caching, filtering, and OpenAI-compatible completions.

#### [MODIFY] [Anti-Cheat Bypass 5.0.user.js](file:///d:/Skillrack-Script/Anti-Cheat%20Bypass%205.0.user.js)
#### [MODIFY] [userscript.user.js](file:///d:/Skillrack-Script/userscript.user.js)

1. **`DEFAULT_SETTINGS` Update:**
   ```javascript
   nvidiaApiKey: "",
   nvidiaModel: "z-ai/glm-5.2",
   ```

2. **`NvidiaProvider` Module:**
   - Base URL: `https://integrate.api.nvidia.com/v1`
   - Cache key: `nvidia_models_cache` (6-hour TTL)
   - Fallback catalog: 15 curated free-tier models
   - Normalizer groups by publisher and enriches with tags/context from fallback catalog
   - `validateApiKey()`: checks for `nvapi-` prefix and minimum length — no key logging

3. **`generateWithNvidia` Completion Helper:**
   - Issues `POST` to `/v1/chat/completions` with standard OpenAI payload
   - Non-streaming (`stream: false`) with `max_tokens: 16384`
   - Throws user-friendly error messages for 401, 429, 5xx — never exposes raw key

4. **Settings UI Panel:**
   - Added `<option value="nvidia">NVIDIA NIM (Free Tier)</option>` to AI Provider select
   - Toggled visibility of `nvidia-model-wrapper` on provider change
   - NVIDIA API Key text input (placeholder: `nvapi-...`)
   - Dynamic model selector with search, refresh, grouped by publisher (NVIDIA > Z.ai > DeepSeek > Google > Mistral > Moonshot > MiniMax > Qwen > StepFun > Other)
   - Model dropdown text: `Name [Context] — Tags`
   - Footer note updated with link to `build.nvidia.com` in NVIDIA green (`#76b900`)

5. **`generateSolution` Integration:**
   ```javascript
   case 'nvidia':
       return await generateWithNvidia(promptText);
   ```

---

## Verification Plan

### Automated/Review Verification
- Perform a TypeScript/JavaScript code review on the implementation following the `/typescript-reviewer` rules.
- Check files for JavaScript syntax errors.
- Verify no API key values appear in `console.log()` or error messages.

### Manual Verification
- Verify settings panel UI rendering for NVIDIA (API Key input, Model selector, grouped optgroups).
- Without an API key: confirm fallback catalog loads (15 models).
- With a valid `nvapi-` key: confirm live `GET /models` populates the dropdown.
- With an invalid key (not `nvapi-` prefix): confirm format error shown without triggering network request.
- Confirm `case 'nvidia'` routes correctly in `generateSolution`.
