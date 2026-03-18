/**
 * Multi-provider AI fallback chain via Cloudflare Worker proxies.
 *
 * Priority: Groq → Together AI → OpenAI → Gemini (proxy)
 *
 * All four endpoints are zero-config — no API keys needed in the client.
 * Each worker handles key rotation internally.
 */

import { SettingsManager } from '../../SettingsManager';

// ── Endpoints ─────────────────────────────────────────────────────────────────
const WORKERS = {
  groq:     'https://square-bush-5dbc.mogatas-princealjohn-05082003.workers.dev/',
  together: 'https://cold-shadow-dce7.mogatas-princealjohn-05082003.workers.dev/',
  openai:   'https://cold-sunset-018a.mogatas-princealjohn-05082003.workers.dev/v1/chat/completions',
  gemini:   'https://geminisatellite.mogatas-princealjohn-05082003.workers.dev/',
} as const;

// ── Models per performance tier ───────────────────────────────────────────────
// perf 1-3 → lite/fast, 4-7 → balanced, 8-10 → best available
function pickModels(perf: number) {
  if (perf <= 3) return {
    groq:     'llama-3.1-8b-instant',
    together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    openai:   'gpt-4o-mini',
  };
  if (perf <= 7) return {
    groq:     'llama-3.3-70b-versatile',
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    openai:   'gpt-4o-mini',
  };
  return {
    groq:     'llama-3.3-70b-versatile',
    together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    openai:   'gpt-4o',
  };
}

// ── Shared message type ───────────────────────────────────────────────────────
export interface WorkerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WorkerOptions {
  maxTokens?: number;
  temperature?: number;
  /** Request JSON output (adds response_format where supported) */
  json?: boolean;
  signal?: AbortSignal;
}

// ── OpenAI-compatible call ────────────────────────────────────────────────────
async function callOpenAI(
  url: string,
  model: string,
  messages: WorkerMessage[],
  opts: WorkerOptions,
  extra?: Record<string, string>,
  retries: number = 1
): Promise<string> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify({
          model,
          messages,
          max_tokens:  opts.maxTokens  ?? 2048,
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: opts.signal,
      });

      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        // 403 from Groq = bad key in rotation, worth retrying
        if (res.status === 403 && attempt < retries) {
          console.warn(`[LLM] ${res.status} — key rotation retry ${attempt + 1}/${retries}`);
          lastError = err;
          continue;
        }
        throw err;
      }

      const data = await res.json();
      const text: string | undefined = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty OpenAI-compatible response');
      return text;
    } catch (err: any) {
      lastError = err;
      if (attempt < retries && err?.status === 403) continue;
      throw err;
    }
  }
  throw lastError ?? new Error('callOpenAI exhausted retries');
}

// ── Gemini proxy (native Gemini REST format) ──────────────────────────────────
async function callGeminiProxy(messages: WorkerMessage[], opts: WorkerOptions): Promise<string> {
  const system = messages.find(m => m.role === 'system')?.content;
  const convo  = messages.filter(m => m.role !== 'system');

  const body: any = {
    contents: convo.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: opts.maxTokens  ?? 2048,
      temperature:     opts.temperature ?? 0.7,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(WORKERS.gemini, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const err: any = new Error(`Gemini proxy HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini proxy response');
  return text;
}

// ── Main export: full fallback chain ─────────────────────────────────────────
export async function generateWithFallback(
  messages: WorkerMessage[],
  opts: WorkerOptions = {}
): Promise<string> {
  const perf   = SettingsManager.getSettings().llmPerformance;
  const models = pickModels(perf);

  const chain: Array<{ name: string; call: () => Promise<string> }> = [
    // Groq: worker dead — disabled until new worker deployed
    // { name: 'Groq', call: () => callOpenAI(WORKERS.groq, models.groq, messages, opts, { 'X-Target-Endpoint': 'chat/completions' }, 4) },

    // Together: billing issues on worker keys — disabled until resolved
    // { name: 'Together', call: () => callOpenAI(WORKERS.together, models.together, messages, opts) },

    // OpenAI: all worker keys quota-exhausted — disabled until resolved
    // { name: 'OpenAI', call: () => callOpenAI(WORKERS.openai, models.openai, messages, opts) },

    {
      name: 'GeminiProxy',
      call: () => callGeminiProxy(messages, opts),
    },
  ];

  let lastError: any;
  for (const provider of chain) {
    try {
      const text = await provider.call();
      console.log(`%c[LLM] ✓ ${provider.name}`, 'color:#22c55e;font-weight:bold');
      return text;
    } catch (err: any) {
      console.warn(`[LLM] ${provider.name} failed (${err?.status ?? err?.message}) — next...`);
      lastError = err;
    }
  }

  throw lastError ?? new Error('[LLM] All providers exhausted');
}

// ── Converter: Gemini SDK params → WorkerMessage[] ───────────────────────────
// Used by api.ts to re-use the fallback chain when Gemini SDK itself fails.
import type { GenerateContentParameters } from '@google/genai';

export function geminiParamsToMessages(params: GenerateContentParameters): WorkerMessage[] {
  const messages: WorkerMessage[] = [];

  // System instruction
  const sys = params.config?.systemInstruction;
  if (sys) {
    const text = typeof sys === 'string'
      ? sys
      : (sys as any).parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (text) messages.push({ role: 'system', content: text });
  }

  // Conversation contents
  const contents = Array.isArray(params.contents) ? params.contents : [params.contents];
  for (const c of contents) {
    if (!c) continue;
    const role: WorkerMessage['role'] =
      (c as any).role === 'model' ? 'assistant' : 'user';
    const parts = (c as any).parts ?? [];
    const text  = parts.map((p: any) => p.text ?? '').join('');
    if (text) messages.push({ role, content: text });
  }

  return messages;
}
