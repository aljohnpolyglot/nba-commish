# Model Test Results

Tests run ~2026-04-04. All via Groq/Together AI worker endpoints.

## Groq (via chat worker)

| Model | Speed | TTFT | Notes |
|---|---|---|---|
| `llama-3.3-70b-versatile` | 280 T/s | ~3s | Current chat model — solid quality |
| `openai/gpt-oss-120b` | 500 T/s | 4.4s | Fast, high quality |
| `openai/gpt-oss-20b` | 1000 T/s | 2.2s | Fastest, lighter quality |

## Together AI (via Gemini worker, non-chat sim calls)

| Model | Speed | Notes |
|---|---|---|
| `MiniMax-M2.5` | ~18.2s | Best quality of the batch |
| `DeepSeek-V3` | ~20.4s | Strong quality, slow |
| `cogito-v2` | — | Good quality |
| `Llama-3.3-70B` | — | Weaker for sim |

## Current Routing (post-revert)

- **Chat** (interaction, bypassLLMCheck=true) → Groq Worker (`llama-3.3-70b-versatile`) → Gemini Worker fallback
- **Non-chat / sim** → Direct Gemini keys (local dev) → Gemini Worker (Together AI primary, Gemini fallback) → workerProviders last resort

## Key Findings

- Together AI MiniMax-M2.5 produces noticeably better sim narrative than Llama-3.3-70B
- Token budget was the "smoking gun" — high `maxOutputTokens` caused verbose/slow responses
- Reduced token limits (2026-04-04):
  - Advance day sim: 16384 → 6000 base
  - League pulse / content / free agents: 8192 → 4096 base
  - Floor: 4096 → 1536 (allows perf mode 1 to breathe)
- Groq non-chat fallback (kimi-k2) was tested but reverted — Together AI works fine
