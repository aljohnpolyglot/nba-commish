// cloudflare-worker/index.js
// Together AI (primary) → Gemini key rotation (fallback)

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://nba-commish.pages.dev",
  "https://basketcommissionersim.com",
  "https://www.basketcommissionersim.com",
];

const MODEL_MAP = {
  1: "meta-llama/Llama-3.3-70B-Instruct-Turbo",  // Blitz fallback (Groq gpt-oss-120b handles primary client-side)
  2: "deepcogito/cogito-v2-1-671b",                 // Standard
  3: "MiniMaxAI/MiniMax-M2.5-FP4"                 // Elite
};
const MODEL_FALLBACK_CAROUSEL = [
  "MiniMaxAI/MiniMax-M2.5-FP4",
  "deepseek-ai/DeepSeek-V3",
  "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "moonshotai/Kimi-K2.5",
];
const ENABLE_GEMINI_FALLBACK = false; // set to true to re-enable Gemini fallback

function getGeminiKeys(env) {
  return [
    env.GEMINI_KEY_1,  env.GEMINI_KEY_2,  env.GEMINI_KEY_3,
    env.GEMINI_KEY_4,  env.GEMINI_KEY_5,  env.GEMINI_KEY_6,
    env.GEMINI_KEY_7,  env.GEMINI_KEY_8,  env.GEMINI_KEY_9,
    env.GEMINI_KEY_10, env.GEMINI_KEY_11, env.GEMINI_KEY_12,
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

async function callGeminiWithRotation(keys, model, body) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const key = shuffled[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    console.log(`[Worker] Trying Gemini key #${i + 1} of ${shuffled.length}...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (response.ok) {
      console.log(`[Worker] Gemini key #${i + 1} succeeded.`);
      return response;
    }

    const status = response.status;

    if (status === 429 || (status >= 500 && status < 600)) {
      console.warn(`[Worker] Gemini key #${i + 1} returned ${status} — trying next...`);
      continue;
    }

    // Non-retriable (400, 403) — return immediately
    console.error(`[Worker] Gemini key #${i + 1} returned non-retriable ${status}`);
    return response;
  }

  return null; // all Gemini keys exhausted
}

async function callTogetherPrimary(togetherKeys, geminiBody, corsHeaders, modelTier) {
  const shuffled = [...togetherKeys].sort(() => Math.random() - 0.5);

  // Convert Gemini body format → OpenAI messages
  const contents = geminiBody.contents ?? [];
  const messages = [];

  const sysText = geminiBody.system_instruction?.parts?.[0]?.text;
  if (sysText) messages.push({ role: "system", content: sysText });

  const contentArray = Array.isArray(contents) ? contents : [contents];
  for (const c of contentArray) {
    const role = c.role === "model" ? "assistant" : "user";
    const content = Array.isArray(c.parts)
      ? c.parts.map(p => p.text ?? "").join("")
      : (c.text ?? "");
    if (content) messages.push({ role, content });
  }

  const maxTokens = geminiBody.generationConfig?.maxOutputTokens ?? 8192;
  const wantsJson = geminiBody.generationConfig?.responseMimeType === "application/json";
  const responseFormat = wantsJson ? { type: "json_object" } : undefined;

  for (let i = 0; i < shuffled.length; i++) {
    const reqBody = {
      model: MODEL_MAP[modelTier] || MODEL_MAP[2],
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    };
    if (responseFormat) reqBody.response_format = responseFormat;

    const res = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${shuffled[i]}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (res.ok) {
      console.log(`[Worker] ✅ Together key #${i + 1} succeeded (primary)`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (!text) {
        console.warn(`[Worker] Model ${MODEL_MAP[modelTier]} returned empty — trying carousel fallback`);
        for (const fallbackModel of MODEL_FALLBACK_CAROUSEL) {
          if (fallbackModel === (MODEL_MAP[modelTier] || MODEL_MAP[2])) continue;
          const fallbackReqBody = { model: fallbackModel, messages, max_tokens: maxTokens, temperature: 0.7 };
          if (responseFormat) fallbackReqBody.response_format = responseFormat;
          const fallbackRes = await fetch("https://api.together.xyz/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${shuffled[i]}` },
            body: JSON.stringify(fallbackReqBody),
          });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const fallbackText = fallbackData?.choices?.[0]?.message?.content ?? "";
            if (fallbackText) {
              console.log(`[Worker] ✅ Carousel fallback succeeded with ${fallbackModel}`);
              const wrapped = { candidates: [{ content: { parts: [{ text: fallbackText }] } }], provider: `together-carousel-${fallbackModel}` };
              return Response.json(wrapped, { headers: { ...corsHeaders, "X-Provider-Used": fallbackModel } });
            }
          }
        }
      }

      // Wrap in Gemini-shaped response so client code needs no changes
      const wrapped = {
        candidates: [{ content: { parts: [{ text }] } }],
        provider: 'together-ai',
      };
      return Response.json(wrapped, {
        headers: { ...corsHeaders, "X-Provider-Used": "together" },
      });
    }

    if (res.status === 429 || res.status >= 500) {
      console.warn(`[Worker] Together key #${i + 1} returned ${res.status} — trying next`);
      continue;
    }

    break; // non-retriable
  }

  return null;
}

export default {
  async fetch(request, env) {
    // ── CORS ──────────────────────────────────────────────────────────────────
    const origin = request.headers.get("Origin");
    const corsHeaders =
      origin && ALLOWED_ORIGINS.includes(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
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

    // ── Keys ──────────────────────────────────────────────────────────────────
    const geminiKeys   = getGeminiKeys(env);
    const togetherKeys = getTogetherKeys(env);

    if (geminiKeys.length === 0 && togetherKeys.length === 0) {
      return Response.json(
        { error: "No API keys configured on the server." },
        { status: 500, headers: corsHeaders }
      );
    }

    const url   = new URL(request.url);
    const model = url.searchParams.get("model") || "gemini-2.5-flash";
    const body  = await request.text();

    console.log(`[Worker] model: ${model}, Together keys: ${togetherKeys.length}, Gemini keys: ${geminiKeys.length}`);

    // ── Together AI primary ───────────────────────────────────────────────────
    try {
      if (togetherKeys.length > 0) {
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch { parsedBody = {}; }

        const modelTier = parsedBody.modelTier || 2;
        const togetherResponse = await callTogetherPrimary(togetherKeys, parsedBody, corsHeaders, modelTier);
        if (togetherResponse) return togetherResponse;
      }

      // ── Gemini fallback ───────────────────────────────────────────────────
      if (ENABLE_GEMINI_FALLBACK && geminiKeys.length > 0) {
        console.warn("[Worker] All Together keys exhausted — falling back to Gemini");
        const geminiResponse = await callGeminiWithRotation(geminiKeys, model, body);

        if (geminiResponse && geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          return Response.json({ ...geminiData, provider: 'gemini' }, {
            headers: { ...corsHeaders, "X-Provider-Used": "gemini-fallback" },
          });
        }

        if (geminiResponse && !geminiResponse.ok) {
          const errorBody = await geminiResponse.json().catch(() => ({}));
          console.error(`[Worker] Gemini fallback non-retriable error: ${geminiResponse.status}`);
          return Response.json(
            { error: "Gemini API request failed.", details: errorBody },
            { status: geminiResponse.status, headers: corsHeaders }
          );
        }
      }

      // Together AI failed — no fallback active
      console.warn("[Worker] Together AI exhausted, ENABLE_GEMINI_FALLBACK =", ENABLE_GEMINI_FALLBACK);
      return Response.json(
        { error: "Together AI failed, no fallback available" },
        { status: 503, headers: corsHeaders }
      );

    } catch (err) {
      console.error("[Worker] Unexpected error:", err);
      return Response.json(
        { error: "Worker crashed unexpectedly.", details: err.message },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
