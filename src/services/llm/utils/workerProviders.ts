/**
 * AI provider via Cloudflare Worker proxy (GeminiProxy only).
 */

// ── Endpoint ──────────────────────────────────────────────────────────────────
const GEMINI_WORKER = 'https://geminisatellite.mogatas-princealjohn-05082003.workers.dev/';

// ── Shared message type ───────────────────────────────────────────────────────
export interface WorkerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WorkerOptions {
  maxTokens?: number;
  temperature?: number;
  /** Request JSON output */
  json?: boolean;
  signal?: AbortSignal;
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

  const res = await fetch(GEMINI_WORKER, {
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

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateWithFallback(
  messages: WorkerMessage[],
  opts: WorkerOptions = {}
): Promise<string> {
  try {
    const text = await callGeminiProxy(messages, opts);
    console.log('%c[LLM] ✓ GeminiProxy', 'color:#22c55e;font-weight:bold');
    return text;
  } catch (err: any) {
    console.warn(`[LLM] GeminiProxy failed (${err?.status ?? err?.message})`);
    throw err;
  }
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
