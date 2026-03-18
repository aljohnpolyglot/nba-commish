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

// ── Route 1: Cloudflare Worker (production) ───────────────────────────────────
// The Worker holds all 12 keys as secrets and does its own rotation.
// We just send the same payload the SDK would send to Gemini.
async function callViaWorker(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const model = params.model ?? "gemini-2.5-flash";

  // Build the request body in the same shape the Gemini REST API expects
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

  // Extract text from Gemini REST response shape
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return wrapText(text);
}

// ── Route 2: Direct Gemini SDK (local dev, all .env keys available) ───────────
const _sdkCache = new Map<string, GoogleGenAI>();
function getSDK(key: string): GoogleGenAI {
  if (!_sdkCache.has(key)) _sdkCache.set(key, new GoogleGenAI({ apiKey: key }));
  return _sdkCache.get(key)!;
}

async function callDirectWithRotation(
  params: GenerateContentParameters,
  maxRetries: number,
  initialDelayMs: number
): Promise<GenerateContentResponse | null> {
  const keys = getAllKeys();
  if (keys.length === 0) return null;

  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  for (let k = 0; k < shuffled.length; k++) {
    const sdk = getSDK(shuffled[k]);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[LLM] Direct key ${k + 1}/${shuffled.length}, attempt ${attempt + 1}`);
        return await sdk.models.generateContent(params);
      } catch (err: any) {
        const status: number = err?.status ?? err?.response?.status ?? 0;
        if (status === 429 || (status >= 500 && status < 600)) {
          if (attempt === maxRetries) { console.warn(`[LLM] Key ${k + 1} exhausted — next`); break; }
          const delay = Math.min(initialDelayMs * Math.pow(2, attempt), 8000) + Math.random() * 500;
          console.warn(`[LLM] Key ${k + 1} got ${status}, retry in ${delay.toFixed(0)}ms`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[LLM] Key ${k + 1} non-retriable ${status}`); break;
        }
      }
    }
  }
  return null;
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

  const localKeys = getAllKeys();
  const isLocalDev = localKeys.length > 0;

  if (isLocalDev) {
    // ── Local dev: hit Gemini directly, rotate across all .env keys ──────────
    console.log(`[LLM] Local dev mode — ${localKeys.length} keys available, calling Gemini directly.`);
    const result = await callDirectWithRotation(params, maxRetries, initialDelayMs);
    if (result) return result;
    console.warn("[LLM] All local keys failed — falling back to Worker.");
  }

  // ── Production (or local keys exhausted): go through the Worker ──────────
  try {
    console.log("[LLM] Calling via Cloudflare Worker...");
    return await callViaWorker(params);
  } catch (workerErr: any) {
    console.error("[LLM] Worker failed:", workerErr?.message);
  }

  // ── Last resort: workerProviders chain (Groq → Together → etc.) ──────────
  try {
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