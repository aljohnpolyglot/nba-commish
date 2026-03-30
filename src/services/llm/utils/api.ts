// src/services/llm/utils/api.ts
// Routing strategy (all envs):
//   Chat (interaction) → Groq Worker (fast lane, no fallback)
//   Non-chat           → Together AI Worker (primary, Gemini fallback on worker side)

import { SettingsManager } from "../../SettingsManager";

// ── Local type shims (replaces @google/genai import) ─────────────────────────
export interface GenerateContentResponse { text: string }
export interface GenerateContentParameters {
  model?: string;
  contents: any;
  config?: {
    systemInstruction?: string | { parts: { text: string }[] };
    responseMimeType?: string;
    responseSchema?: any;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    thinkingConfig?: any;
  };
}
export enum ThinkingLevel { NONE = 'NONE', LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH' }

// ── Config ────────────────────────────────────────────────────────────────────
const TOGETHER_WORKER_URL = "https://geminisatellite.mogatas-princealjohn-05082003.workers.dev/";
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

// ── Route B: Together AI Worker ───────────────────────────────────────────────
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

  const response = await fetch(`${TOGETHER_WORKER_URL}?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Together Worker ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  console.log(`[LLM] Worker response from: ${data.provider || 'unknown'}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return wrapText(text);
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
      console.warn(`[LLM] Groq Worker failed: ${groqErr?.message}`);
      return wrapText("I'm having trouble connecting right now. Try again in a moment.");
    }
  }

  // ── Non-chat calls → Together Worker (Together AI primary, Gemini fallback) ──
  const tier = settings.llmPerformance as 1 | 2 | 3;
  const models = MODEL_TIERS[tier] ?? MODEL_TIERS[1];
  console.log(`[LLM] using: Worker (Together→Gemini), tier ${tier}`);

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const nextModel = models[i + 1];
    const paramsWithModel: GenerateContentParameters = { ...params, model };

    try {
      const result = await callViaGeminiWorker(paramsWithModel);
      console.log(`%c[LLM] ✅ Together Worker succeeded (${model})`, "color:#22c55e;font-weight:bold");
      return result;
    } catch (workerErr: any) {
      console.warn(`[LLM] Together Worker failed (${model}): ${workerErr?.message}${nextModel ? ` — trying ${nextModel}` : ""}`);
    }
  }

  console.error("[LLM] All Gemini tiers exhausted — returning fallback.");
  return buildMockResponse(params);
}
