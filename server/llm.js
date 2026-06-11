// llm.js
// ─────────────────────────────────────────────────────────────────
// Provider-agnostic LLM adapter.
//
// Add new providers by adding a case below. The rest of the app
// only ever calls callLLM(system, userMessage, maxTokens) and gets
// back a plain string of the model's text response.
// ─────────────────────────────────────────────────────────────────

const PROVIDER  = process.env.LLM_PROVIDER  || "openai";
const BASE_URL  = (process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const MODEL     = process.env.LLM_MODEL     || "deepseek-chat";
const API_KEY   = process.env.LLM_API_KEY   || "";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * OpenAI-compatible Chat Completions API.
 * Works for: DeepSeek, OpenAI, Azure OpenAI, vLLM, TGI, Ollama (OpenAI mode),
 * and most internal SIPR/NIPR/FENCES gateways that expose an
 * OpenAI-style /chat/completions endpoint.
 */
async function callOpenAICompatible(system, user, maxTokens) {
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Native Anthropic Messages API format.
 * Works for: api.anthropic.com directly, or any internal gateway
 * that mirrors the /v1/messages request/response schema.
 */
async function callAnthropicNative(system, user, maxTokens) {
  const resp = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Main entry point. Retries with backoff on rate limits / transient errors.
 */
export async function callLLM(system, user, maxTokens = 900) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      switch (PROVIDER) {
        case "anthropic":
          return await callAnthropicNative(system, user, maxTokens);
        case "openai":
        default:
          return await callOpenAICompatible(system, user, maxTokens);
      }
    } catch (err) {
      const msg = String(err.message || "");
      const isRateLimit = msg.includes("429") || msg.includes("529") || msg.includes("rate");
      if (attempt === 3) throw err;
      await sleep(isRateLimit ? (attempt + 1) * 5000 : (attempt + 1) * 2000);
    }
  }
  return "";
}

export const config = { PROVIDER, BASE_URL, MODEL, hasKey: !!API_KEY };
