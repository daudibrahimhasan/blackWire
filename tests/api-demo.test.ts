import { describe, expect, it } from "vitest";
import { apiDemoConfigSchema } from "../src/api-demo/config.js";
import { extractAnthropic, extractChatCompletion, extractGemini, extractOpenAiResponse } from "../src/api-demo/providers.js";
import { parseBid } from "../src/api-demo/discussion.js";

describe("five-model API demo", () => {
  it("requires exactly five agents", () => expect(apiDemoConfigSchema.safeParse({ agents: [] }).success).toBe(false));
  it("extracts OpenAI Responses text", () => expect(extractOpenAiResponse({ output_text: "answer" })).toBe("answer"));
  it("extracts compatible chat text", () => expect(extractChatCompletion({ choices: [{ message: { content: "answer" } }] })).toBe("answer"));
  it("extracts Anthropic text blocks", () => expect(extractAnthropic({ content: [{ type: "text", text: "answer" }] })).toBe("answer"));
  it("extracts Gemini text parts", () => expect(extractGemini({ candidates: [{ content: { parts: [{ text: "answer" }] } }] })).toBe("answer"));
  it("keeps a silent model out of the discussion", () => expect(parseBid("PASS", 2)).toBeUndefined());
  it("parses a discrepancy bid", () => expect(parseBid("SPEAK|95|DISCREPANCY\nThe proposed lock does not cover retries.", 1)).toMatchObject({ agentIndex: 1, urgency: 95, kind: "DISCREPANCY" }));
  it("parses a consensus resolution", () => expect(parseBid("RESOLVED|88|SYNTHESIS\nUse an idempotency key and atomic insert.", 4)).toMatchObject({ status: "RESOLVED", urgency: 88 }));
});
