// src/services/llm/utils/api.ts
// — Local dev: calls Gemini SDK directly (uses .env keys, never leaves your machine)
// — Production: routes through Cloudflare Worker (keys are server-side secrets, never in the bundle)

import {
  GoogleGenAI,
  GenerateContentResponse,
  GenerateContentParameters,
  ThinkingLevel,
} from "@google/genai";
import { SettingsManager } from "../../SettingsManager";
import {
  generateWithFallback,
  geminiParamsToMessages,
  WorkerOptions,
} from "./workerProviders";

export { ThinkingLevel };

// ── Config ────────────────────────────────────────────────────────────────────
const WORKER_URL = "https://geminisatellite.mogatas-princealjohn-05082003.workers.dev/";

// Chat always uses this model regardless of tier
const CHAT_MODEL = "gemini-2.5-flash-lite";

// Cascading model lists per performance tier.
// gemini-2.5-flash is the proven workhorse — high quota, succeeds on key 1.
// Pro/preview models go last as opportunistic upgrades when quota allows.
const MODEL_TIERS: Record<1 | 2 | 3, string[]> = {
  1: [
    "gemini-2.5-flash-lite",    // fast, high quota — primary
    "gemini-2.5-flash",         // fallback if lite is down
  ],
  2: [
    "gemini-2.5-flash",         // reliable workhorse — primary
    "gemini-2.5-flash-lite",    // fallback
  ],
  3: [
    "gemini-2.5-flash",         // reliable workhorse — primary (pro models quota-limited)
    "gemini-2.5-pro",           // opportunistic upgrade when quota allows
    "gemini-2.5-flash-lite",    // last resort
  ],
};

// In production (npm run build), VITE_ vars are stripped from the bundle.
// If no keys are found, we know we're in production and should use the Worker.
function getAllKeys(): string[] {
  const e = (typeof import.meta !== "undefined" && (import.meta as any).env)
    ? (import.meta as any).env : {};
  const p = (typeof process !== "undefined" && process.env) ? process.env : {};

  return [
    e.VITE_GEMINI_API_KEY         ?? p.GEMINI_API_KEY,
    e.VITE_GEMINI_API_KEY_ALT     ?? p.GEMINI_API_KEY_ALT,
    e.VITE_GEMINI_API_KEY_ALT_2   ?? p.GEMINI_API_KEY_ALT_2,
    e.VITE_GEMINI_API_KEY_ALT_3   ?? p.GEMINI_API_KEY_ALT_3,
    e.VITE_GEMINI_API_KEY_ALT_4   ?? p.GEMINI_API_KEY_ALT_4,
    e.VITE_GEMINI_API_KEY_ALT_5   ?? p.GEMINI_API_KEY_ALT_5,
    e.VITE_GEMINI_API_KEY_ALT_6   ?? p.GEMINI_API_KEY_ALT_6,
    e.VITE_GEMINI_API_KEY_ALT_7   ?? p.GEMINI_API_KEY_ALT_7,
    e.VITE_GEMINI_API_KEY_ALT_8   ?? p.GEMINI_API_KEY_ALT_8,
    e.VITE_GEMINI_API_KEY_ALT_9   ?? p.GEMINI_API_KEY_ALT_9,
    e.VITE_GEMINI_API_KEY_ALT_10  ?? p.GEMINI_API_KEY_ALT_10,
    e.VITE_GEMINI_API_KEY_ALT_11  ?? p.GEMINI_API_KEY_ALT_11,
  ].filter((k): k is string => typeof k === "string" && k.length > 10);
}

// ── Mock response ─────────────────────────────────────────────────────────────
function buildMockResponse(params: GenerateContentParameters): GenerateContentResponse {
  const isJson = params.config?.responseMimeType === "application/json";
  return {
    text: isJson
      ? JSON.stringify({ newEmails: [], newNews: [], newSocialPosts: [], replies: [], title: "Fallback Title", description: "Fallback Description" })
      : "AI features are disabled in settings.",
  } as GenerateContentResponse;
}

function wrapText(text: string): GenerateContentResponse {
  return { text } as GenerateContentResponse;
}

// ── Route 1: Cloudflare Worker ────────────────────────────────────────────────
async function callViaWorker(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const model = params.model ?? "gemini-2.5-flash";

  const body = {
    contents: params.contents,
    ...(params.config ? {
      generationConfig: {
        ...(params.config.responseMimeType && { responseMimeType: params.config.responseMimeType }),
        ...(params.config.maxOutputTokens && { maxOutputTokens: params.config.maxOutputTokens }),
        ...(params.config.temperature !== undefined && { temperature: params.config.temperature }),
        ...(params.config.topP !== undefined && { topP: params.config.topP }),
        ...(params.config.topK !== undefined && { topK: params.config.topK }),
      }
    } : {}),
    ...(params.config?.systemInstruction ? { system_instruction: { parts: [{ text: params.config.systemInstruction }] } } : {}),
  };

  const response = await fetch(`${WORKER_URL}?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Worker error ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return wrapText(text);
}

// ── Route 2: Direct Gemini SDK (local dev) ────────────────────────────────────
const _sdkCache = new Map<string, GoogleGenAI>();
function getSDK(key: string): GoogleGenAI {
  if (!_sdkCache.has(key)) _sdkCache.set(key, new GoogleGenAI({ apiKey: key }));
  return _sdkCache.get(key)!;
}

// Returns null when all keys fail.
// allRateLimited=true means every failure was 429 — caller should skip Worker too.
async function callDirectWithRotation(
  params: GenerateContentParameters,
  maxRetries: number,
  initialDelayMs: number
): Promise<{ response: GenerateContentResponse; allRateLimited: false } | { response: null; allRateLimited: boolean }> {
  const keys = getAllKeys();
  if (keys.length === 0) return { response: null, allRateLimited: false };

  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  let rateLimitedCount = 0;

  for (let k = 0; k < shuffled.length; k++) {
    const sdk = getSDK(shuffled[k]);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[LLM] Direct key ${k + 1}/${shuffled.length}, attempt ${attempt + 1} (${params.model})`);
        const response = await sdk.models.generateContent(params);
        return { response, allRateLimited: false };
      } catch (err: any) {
        const status: number = err?.status ?? err?.response?.status ?? 0;
        if (status === 429) {
          // Quota exhausted — skip this key immediately, no backoff (quota won't recover in seconds)
          console.warn(`[LLM] Key ${k + 1} rate-limited (429) for ${params.model} — skipping key`);
          rateLimitedCount++;
          break;
        } else if (status >= 500 && status < 600) {
          // Transient server error — retry with backoff
          if (attempt === maxRetries) { console.warn(`[LLM] Key ${k + 1} exhausted on 5xx — next key`); break; }
          const delay = Math.min(initialDelayMs * Math.pow(2, attempt), 8000) + Math.random() * 500;
          console.warn(`[LLM] Key ${k + 1} got ${status}, retry in ${delay.toFixed(0)}ms`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[LLM] Key ${k + 1} non-retriable ${status} (${params.model})`);
          break;
        }
      }
    }
  }

  const allRateLimited = rateLimitedCount === shuffled.length;
  if (allRateLimited) {
    console.warn(`[LLM] 🔄 All ${shuffled.length} keys rate-limited for ${params.model} — cascading to next model`);
  }
  return { response: null, allRateLimited };
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function generateContentWithRetry(
  params: GenerateContentParameters,
  maxRetries: number = 2,
  initialDelayMs: number = 800
): Promise<GenerateContentResponse> {
  const settings = SettingsManager.getSettings();

  if (!settings.enableLLM) {
    console.log("[LLM] Disabled — returning mock.");
    return buildMockResponse(params);
  }

  // Chat calls (interaction) always use flash-lite — no cascade.
  // Detected when params.model is CHAT_MODEL but tier > 1 (meaning the caller
  // explicitly chose flash-lite rather than it being the tier default).
  const tier = settings.llmPerformance as 1 | 2 | 3;
  const isChat = params.model === CHAT_MODEL && tier > 1;
  const models = isChat ? [CHAT_MODEL] : (MODEL_TIERS[tier] ?? MODEL_TIERS[2]);

  const localKeys = getAllKeys();
  const isLocalDev = localKeys.length > 0;

  // Try each model in the cascade
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const nextModel = models[i + 1];
    const paramsWithModel: GenerateContentParameters = { ...params, model };

    let skipWorker = false;

    if (isLocalDev) {
      const { response, allRateLimited } = await callDirectWithRotation(paramsWithModel, maxRetries, initialDelayMs);
      if (response) {
        console.log(`%c[LLM] ✅ Direct succeeded (${model})`, "color:#22c55e;font-weight:bold");
        return response;
      }
      if (allRateLimited) {
        // All keys 429'd — Worker will also 429, skip straight to next model
        skipWorker = true;
        if (nextModel) console.log(`[LLM] ⬇️ Cascading to next model: ${nextModel}`);
      } else {
        console.log(`[LLM] 🌐 Falling back to Worker with model: ${model}`);
      }
    }

    if (!skipWorker) {
      try {
        const result = await callViaWorker(paramsWithModel);
        console.log(`%c[LLM] ✅ Worker succeeded (${model})`, "color:#22c55e;font-weight:bold");
        return result;
      } catch (workerErr: any) {
        console.warn(`[LLM] Worker failed for ${model}: ${workerErr?.message}${nextModel ? ` — trying next model: ${nextModel}` : ''}`);
      }
    }
  }

  // ── Last resort: workerProviders GeminiProxy chain ────────────────────────
  try {
    console.warn("[LLM] All tier models exhausted — falling back to workerProviders.");
    const messages = geminiParamsToMessages(params);
    const isJson = params.config?.responseMimeType === "application/json";
    const opts: WorkerOptions = {
      maxTokens: SettingsManager.getMaxTokens(2048),
      temperature: 0.7,
      json: isJson,
    };
    const text = await generateWithFallback(messages, opts);
    return wrapText(text);
  } catch (e: any) {
    console.error("[LLM] All providers failed:", e?.message);
    return buildMockResponse(params);
  }
}
