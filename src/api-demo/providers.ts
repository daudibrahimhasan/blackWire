import { redactSecrets, sanitizeTerminal } from "../security/sanitize.js";
import type { ApiDemoAgent } from "./config.js";

export interface ModelRequest { agent: ApiDemoAgent; system: string; prompt: string; timeoutMs: number; }

export async function requestModel(request: ModelRequest): Promise<string> {
  const key = request.agent.apiKeyEnv ? process.env[request.agent.apiKeyEnv] : undefined;
  if (request.agent.apiKeyEnv && !key) throw new Error(`${request.agent.label}: environment variable ${request.agent.apiKeyEnv} is not set`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    if (request.agent.provider === "openai") return await openAi(request, key!, "https://api.openai.com/v1");
    if (request.agent.provider === "openai-compatible") return await openAi(request, key, request.agent.baseUrl ?? "");
    if (request.agent.provider === "anthropic") return await anthropic(request, key!);
    return await gemini(request, key!);
  } finally { clearTimeout(timer); }

  async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    let data: unknown; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    if (!response.ok) throw new Error(`${request.agent.label}: API returned ${response.status} ${safeApiError(data)}`);
    return data;
  }

  async function openAi(value: ModelRequest, apiKey: string | undefined, baseUrl: string): Promise<string> {
    if (!baseUrl) throw new Error(`${value.agent.label}: baseUrl is required`);
    const headers: Record<string, string> = {
      "user-agent": "Cline/1.0",
      "http-referer": "https://github.com/antigravity",
      "x-title": "BlackWire",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    };
    if (value.agent.provider === "openai") {
      const data = await post(`${baseUrl.replace(/\/$/, "")}/responses`, headers, { model: value.agent.model, instructions: value.system, input: value.prompt, max_output_tokens: value.agent.maxOutputTokens });
      return extractOpenAiResponse(data);
    }
    try {
      const data = await post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, headers, { model: value.agent.model, messages: [{ role: "system", content: value.system }, { role: "user", content: value.prompt }], max_tokens: value.agent.maxOutputTokens });
      return extractChatCompletion(data);
    } catch (err) {
      if (value.agent.model === "claude-opus-5") {
        const fallbackData = await post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, headers, { model: "claude-opus-4-8", messages: [{ role: "system", content: value.system }, { role: "user", content: value.prompt }], max_tokens: value.agent.maxOutputTokens });
        return extractChatCompletion(fallbackData);
      }
      throw err;
    }
  }
  async function anthropic(value: ModelRequest, apiKey: string): Promise<string> {
    const data = await post(`${(value.agent.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, { model: value.agent.model, system: value.system, max_tokens: value.agent.maxOutputTokens, messages: [{ role: "user", content: value.prompt }] });
    return extractAnthropic(data);
  }
  async function gemini(value: ModelRequest, apiKey: string): Promise<string> {
    const base = (value.agent.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const data = await post(`${base}/models/${encodeURIComponent(value.agent.model)}:generateContent`, { "x-goog-api-key": apiKey }, { systemInstruction: { parts: [{ text: value.system }] }, contents: [{ role: "user", parts: [{ text: value.prompt }] }], generationConfig: { maxOutputTokens: value.agent.maxOutputTokens } });
    return extractGemini(data);
  }
}

export function extractOpenAiResponse(data: unknown): string {
  const value = data as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return requireText(value.output_text ?? value.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join(""), "OpenAI");
}
export function extractChatCompletion(data: unknown): string {
  const value = data as {
    choices?: Array<{
      message?: { content?: string | null; reasoning?: string | null; text?: string | null };
      text?: string;
    }>;
  };
  const first = value.choices?.[0];
  const text = first?.message?.content || first?.message?.reasoning || first?.message?.text || first?.text;
  return requireText(text ?? undefined, "OpenAI-compatible");
}
export function extractAnthropic(data: unknown): string {
  const value = data as { content?: Array<{ type?: string; text?: string }> };
  return requireText(value.content?.filter(x => x.type === "text").map(x => x.text ?? "").join(""), "Anthropic");
}
export function extractGemini(data: unknown): string {
  const value = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return requireText(value.candidates?.[0]?.content?.parts?.map(x => x.text ?? "").join(""), "Gemini");
}
function requireText(value: string | undefined, provider: string): string { const text = value?.trim(); if (!text) throw new Error(`${provider} returned no text`); return text; }
function safeApiError(data: unknown): string {
  const value = data as { error?: { message?: string }; message?: string; raw?: string };
  const raw = String(value.error?.message ?? value.message ?? value.raw ?? "request failed");
  // A hostile or misconfigured endpoint controls this text; it reaches the user's terminal.
  return sanitizeTerminal(redactSecrets(raw.replace(/\b(sk-|AIza)[A-Za-z0-9_-]+/g, "[REDACTED]"))).slice(0, 500);
}
