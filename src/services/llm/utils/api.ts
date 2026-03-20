// src/services/llm/utils/api.ts
// Routing strategy:
//   Chat (interaction) → Groq Worker → Gemini Worker fallback
//   Non-chat localhost → Direct Gemini keys → Gemini Worker (Together AI primary) → workerProviders
//   Non-chat prod      → Gemini Worker (Together AI primary, Gemini fallback) → workerProviders
//   (Direct Gemini skipped in prod — Cloudflare Pages IPs are geo-blocked by Gemini)

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
const GEMINI_WORKER_URL = "https://geminisatellite.mogatas-princealjohn-05082003.workers.dev/";
const GROQ_WORKER_URL = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_CHAT_WORKER_URL)
  ?? "https://nba-chat-worker.mogatas-princealjohn-05082003.workers.dev/";
// Model used for all chat/interaction calls (routed to Groq)
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";

// Gemini cascade tiers for non-chat calls
const MODEL_TIERS: Record<1 | 2 | 3, string[]> = {
  1: ["gemini-2.5-flash-lite", "gemini-2.5-flash"],
  2: ["gemini-2.5-flash",      "gemini-2.5-flash-lite"],
  3: ["gemini-2.5-flash",      "gemini-2.5-pro", "gemini-2.5-flash-lite"],
};

// ── Local Gemini keys (dev only) ──────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function wrapText(text: string): GenerateContentResponse {
  return { text } as GenerateContentResponse;
}

function buildMockResponse(params: GenerateContentParameters): GenerateContentResponse {
  const isJson = params.config?.responseMimeType === "application/json";
  return wrapText(
    isJson
      ? JSON.stringify({ newEmails: [], newNews: [], newSocialPosts: [], replies: [], title: "Fallback Title", description: "Fallback Description" })
      : "AI features are disabled in settings."
  );
}

/** Convert Gemini GenerateContentParameters → OpenAI messages array */
function geminiToOpenAIMessages(params: GenerateContentParameters): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];

  // System instruction
  const sysInstr = params.config?.systemInstruction;
  const sysText = typeof sysInstr === "string"
    ? sysInstr
    : (sysInstr as any)?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  if (sysText) messages.push({ role: "system", content: sysText });

  // Contents
  const contents = params.contents;
  if (typeof contents === "string") {
    messages.push({ role: "user", content: contents });
  } else if (Array.isArray(contents)) {
    for (const c of contents as any[]) {
      const role = c.role === "model" ? "assistant" : (c.role ?? "user");
      const content = Array.isArray(c.parts)
        ? c.parts.map((p: any) => p.text ?? "").join("")
        : (c.text ?? "");
      if (content) messages.push({ role, content });
    }
  } else if (contents && typeof (contents as any) === "object") {
    const c = contents as any;
    const role = c.role === "model" ? "assistant" : (c.role ?? "user");
    const content = Array.isArray(c.parts)
      ? c.parts.map((p: any) => p.text ?? "").join("")
      : (c.text ?? "");
    if (content) messages.push({ role, content });
  }

  return messages;
}

// ── Route A: Groq Worker (chat) ───────────────────────────────────────────────
async function callViaGroqWorker(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const messages = geminiToOpenAIMessages(params);

  const response = await fetch(GROQ_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Endpoint": "chat/completions",
    },
    body: JSON.stringify({
      model: GROQ_CHAT_MODEL,
      messages,
      max_tokens: params.config?.maxOutputTokens ?? 1024,
      temperature: params.config?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq Worker ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const nickname = response.headers.get("X-Groq-Key-Nickname") ?? "?";
  console.log(`%c[LLM] ✅ Groq Worker (${nickname}) → chat`, "color:#a855f7;font-weight:bold");
  return wrapText(text);
}

// ── Route B: Gemini Worker ────────────────────────────────────────────────────
async function callViaGeminiWorker(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const model = params.model ?? "gemini-2.5-flash";

  let normalizedContents: any[];
  if (typeof params.contents === "string") {
    normalizedContents = [{ role: "user", parts: [{ text: params.contents }] }];
  } else if (Array.isArray(params.contents)) {
    normalizedContents = params.contents as any[];
  } else {
    normalizedContents = [params.contents];
  }

  const sysInstr = params.config?.systemInstruction;
  const sysInstrText = typeof sysInstr === "string"
    ? sysInstr
    : (sysInstr as any)?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

  const body = {
    contents: normalizedContents,
    modelTier: SettingsManager.getSettings().llmPerformance,
    ...(params.config ? {
      generationConfig: {
        ...(params.config.responseMimeType  && { responseMimeType:  params.config.responseMimeType }),
        ...(params.config.maxOutputTokens   && { maxOutputTokens:   params.config.maxOutputTokens }),
        ...(params.config.temperature !== undefined && { temperature: params.config.temperature }),
        ...(params.config.topP        !== undefined && { topP:        params.config.topP }),
        ...(params.config.topK        !== undefined && { topK:        params.config.topK }),
      }
    } : {}),
    ...(sysInstrText ? { system_instruction: { parts: [{ text: sysInstrText }] } } : {}),
  };

  const response = await fetch(`${GEMINI_WORKER_URL}?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini Worker ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  console.log(`[LLM] Worker response from: ${data.provider || 'unknown'}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return wrapText(text);
}

// ── Route C: Direct Gemini SDK (local dev) ────────────────────────────────────
const _sdkCache = new Map<string, GoogleGenAI>();
function getSDK(key: string): GoogleGenAI {
  if (!_sdkCache.has(key)) _sdkCache.set(key, new GoogleGenAI({ apiKey: key }));
  return _sdkCache.get(key)!;
}

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
          console.warn(`[LLM] Key ${k + 1} rate-limited (429) for ${params.model} — skipping`);
          rateLimitedCount++;
          break;
        } else if (status >= 500 && status < 600) {
          if (attempt === maxRetries) { break; }
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
  return { response: null, allRateLimited };
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function generateContentWithRetry(
  params: GenerateContentParameters,
  maxRetries: number = 2,
  initialDelayMs: number = 800,
  bypassLLMCheck: boolean = false
): Promise<GenerateContentResponse> {
  const settings = SettingsManager.getSettings();

  if (!settings.enableLLM && !bypassLLMCheck) {
    console.log("[LLM] Disabled — returning mock.");
    return buildMockResponse(params);
  }

  // ── Chat calls → Groq Worker (fast lane, always bypasses Gemini) ──────────
  // Use bypassLLMCheck as the sole signal — sendChatMessage always sets it to true.
  // Model-name comparison is unreliable: simulation can use the same model name as
  // interaction (e.g. gemini-2.5-flash-lite at perf level 1), which would incorrectly
  // route JSON-schema simulation calls to Groq, causing markdown parse failures.
  const isChat = bypassLLMCheck;

  if (isChat) {
    try {
      return await callViaGroqWorker(params);
    } catch (groqErr: any) {
      console.warn(`[LLM] Groq Worker failed: ${groqErr?.message} — trying Gemini Worker`);
      try {
        // Strip thinkingConfig — Gemini worker doesn't support it for chat
        const cleanParams = { ...params, model: 'gemini-2.5-flash', config: { ...params.config, thinkingConfig: undefined } };
        return await callViaGeminiWorker(cleanParams);
      } catch (geminiErr: any) {
        console.warn(`[LLM] Gemini Worker failed: ${geminiErr?.message}`);
        return wrapText("I'm having trouble connecting right now. Try again in a moment.");
      }
    }
  }

  // ── Non-chat calls → Gemini cascade ──────────────────────────────────────
  const tier = settings.llmPerformance as 1 | 2 | 3;
  const models = MODEL_TIERS[tier] ?? MODEL_TIERS[2];
  const localKeys = getAllKeys();
  // VITE_ keys are bundled into the prod build, so check hostname to avoid
  // calling Gemini directly from Cloudflare Pages (geo-blocked datacenter IPs).
  const isProd = typeof window !== "undefined"
    && !window.location.hostname.includes("localhost")
    && !window.location.hostname.includes("127.0.0.1");
  const isLocalDev = localKeys.length > 0 && !isProd;
  console.log(`[LLM] isProd: ${isProd}, using: ${isProd ? 'Worker (Together→Gemini)' : 'Direct keys'}`);

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
        skipWorker = true;
        if (nextModel) console.log(`[LLM] ⬇️ Cascading to: ${nextModel}`);
      } else {
        console.log(`[LLM] 🌐 Falling back to Gemini Worker (${model})`);
      }
    }

    if (!skipWorker) {
      try {
        const result = await callViaGeminiWorker(paramsWithModel);
        console.log(`%c[LLM] ✅ Gemini Worker succeeded (${model})`, "color:#22c55e;font-weight:bold");
        return result;
      } catch (workerErr: any) {
        console.warn(`[LLM] Gemini Worker failed (${model}): ${workerErr?.message}${nextModel ? ` — trying ${nextModel}` : ""}`);
      }
    }
  }

  // ── Last resort: workerProviders chain ────────────────────────────────────
  try {
    console.warn("[LLM] All Gemini tiers exhausted — trying workerProviders.");
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
