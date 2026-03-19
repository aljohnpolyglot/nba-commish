// workers/chat-worker/index.js
// Groq (primary) → Together AI (fallback)
// No KV needed — simple shuffle + 429 skip

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "https://nba-commish.pages.dev",
  "https://basketcommissionersim.com",
  "https://www.basketcommissionersim.com",
];

const GROQ_MODEL      = "llama-3.3-70b-versatile";
const GROQ_MODEL_FAST = "moonshotai/kimi-k2-instruct"; // 60 RPM vs 30 RPM
const TOGETHER_MODEL  = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

function getGroqKeys(env) {
  return [
    env.GROQ_KEY_1,  env.GROQ_KEY_2,  env.GROQ_KEY_3,
    env.GROQ_KEY_4,  env.GROQ_KEY_5,  env.GROQ_KEY_6,
    env.GROQ_KEY_7,  env.GROQ_KEY_8,  env.GROQ_KEY_9,
    env.GROQ_KEY_10,
  ].filter(Boolean);
}

function getTogetherKeys(env) {
  return [
    env.TOGETHER_KEY_1,  env.TOGETHER_KEY_2,  env.TOGETHER_KEY_3,
    env.TOGETHER_KEY_4,  env.TOGETHER_KEY_5,  env.TOGETHER_KEY_6,
    env.TOGETHER_KEY_7,  env.TOGETHER_KEY_8,  env.TOGETHER_KEY_9,
    env.TOGETHER_KEY_10,
  ].filter(Boolean);
}

async function callGroq(keys, body) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const model = i % 2 === 0 ? GROQ_MODEL : GROQ_MODEL_FAST;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${shuffled[i]}`,
      },
      body: JSON.stringify({ ...body, model }),
    });

    if (res.ok) {
      console.log(`[ChatWorker] ✅ Groq key #${i + 1} succeeded`);
      return { res, provider: "groq" };
    }

    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      console.warn(`[ChatWorker] Groq key #${i + 1} returned ${res.status} — trying next`);
      continue;
    }

    // Non-retriable (400, etc.) — surface immediately
    return { res, provider: "groq" };
  }

  return null; // all Groq keys exhausted → trigger fallback
}

async function callTogether(keys, body) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const res = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${shuffled[i]}`,
      },
      body: JSON.stringify({ ...body, model: TOGETHER_MODEL }),
    });

    if (res.ok) {
      console.log(`[ChatWorker] ✅ Together key #${i + 1} succeeded (fallback)`);
      return { res, provider: "together" };
    }

    if (res.status === 429 || res.status >= 500) {
      console.warn(`[ChatWorker] Together key #${i + 1} returned ${res.status} — trying next`);
      continue;
    }

    return { res, provider: "together" };
  }

  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsHeaders = origin && ALLOWED_ORIGINS.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Target-Endpoint",
        }
      : {};

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Only POST requests are accepted.", {
        status: 405,
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    const groqKeys     = getGroqKeys(env);
    const togetherKeys = getTogetherKeys(env);

    if (groqKeys.length === 0 && togetherKeys.length === 0) {
      return Response.json(
        { error: "No API keys configured on the server." },
        { status: 500, headers: corsHeaders }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
    }

    // ── Groq primary ──────────────────────────────────────────────────────────
    let result = groqKeys.length > 0 ? await callGroq(groqKeys, body) : null;

    // ── Together fallback ─────────────────────────────────────────────────────
    if (!result && togetherKeys.length > 0) {
      result = await callTogether(togetherKeys, body);
    }

    if (!result) {
      return Response.json(
        { error: "All providers exhausted. Try again later." },
        { status: 503, headers: corsHeaders }
      );
    }

    const data = await result.res.json();
    return Response.json(data, {
      status: result.res.status,
      headers: { ...corsHeaders, "X-Provider-Used": result.provider },
    });
  },
};
