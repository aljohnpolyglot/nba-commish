// src/index.js  —  Cloudflare Worker with Gemini key rotation + fallback

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:5173",   // Vite default
  "http://localhost:3000",
  "https://nba-commish.pages.dev",
  "https://basketcommissionersim.com",  // ← add this
  "https://www.basketcommissionersim.com",  // ← and this
];
// Pull all configured keys from env into an array (skips undefined ones)
function getKeys(env) {
  return [
    env.GEMINI_KEY_1,
    env.GEMINI_KEY_2,
    env.GEMINI_KEY_3,
    env.GEMINI_KEY_4,
    env.GEMINI_KEY_5,
    env.GEMINI_KEY_6,
    env.GEMINI_KEY_7,
    env.GEMINI_KEY_8,
    env.GEMINI_KEY_9,
    env.GEMINI_KEY_10,
    env.GEMINI_KEY_11,
    env.GEMINI_KEY_12,
  ].filter(Boolean); // remove undefined/null
}

// Try each key in a shuffled order, fall back on 429 or 5xx
async function callGeminiWithRotation(keys, model, body) {
  // Shuffle so load is spread across keys randomly
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const key = shuffled[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    console.log(`[Worker] Trying key #${i + 1} of ${shuffled.length}...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (response.ok) {
      console.log(`[Worker] Key #${i + 1} succeeded.`);
      return response; // ✅ success
    }

    const status = response.status;

    if (status === 429 || (status >= 500 && status < 600)) {
      console.warn(`[Worker] Key #${i + 1} returned ${status} — trying next key...`);
      continue; // try next key
    }

    // Non-retriable error (400, 403, etc.) — return immediately
    console.error(`[Worker] Key #${i + 1} returned non-retriable ${status}`);
    return response;
  }

  // All keys exhausted
  return new Response(
    JSON.stringify({ error: "All Gemini API keys are exhausted or rate-limited. Try again later." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

export default {
  async fetch(request, env) {
    // ── CORS setup ────────────────────────────────────────────────────────────
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

    // ── Validate keys ─────────────────────────────────────────────────────────
    const keys = getKeys(env);
    if (keys.length === 0) {
      console.error("FATAL: No GEMINI_KEY_* secrets found in Worker env.");
      return Response.json(
        { error: "No API keys configured on the server." },
        { status: 500, headers: corsHeaders }
      );
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    // Optionally allow the client to specify a model via ?model=...
    const url = new URL(request.url);
    const model = url.searchParams.get("model") || "gemini-2.0-flash";
    const body = await request.text(); // read once, reuse in rotation

    console.log(`[Worker] Request for model: ${model}, keys available: ${keys.length}`);

    // ── Call Gemini with rotation ─────────────────────────────────────────────
    try {
      const geminiResponse = await callGeminiWithRotation(keys, model, body);

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.json().catch(() => ({}));
        console.error(`[Worker] All keys failed. Last status: ${geminiResponse.status}`);
        return Response.json(
          { error: "Gemini API request failed.", details: errorBody },
          { status: geminiResponse.status, headers: corsHeaders }
        );
      }

      // ── Stream the successful response back with CORS headers ─────────────
      const responseHeaders = new Headers(geminiResponse.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

      return new Response(geminiResponse.body, {
        status: geminiResponse.status,
        headers: responseHeaders,
      });
    } catch (err) {
      console.error("[Worker] Unexpected error:", err);
      return Response.json(
        { error: "Worker crashed unexpectedly.", details: err.message },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};