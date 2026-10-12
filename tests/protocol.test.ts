import { describe, expect, it } from "vitest";
import { bridgeMessageSchema, sessionSchema } from "../src/protocol/wire.js";

const session = {
  id: "GEM-1234", instanceId: "550e8400-e29b-41d4-a716-446655440000", cliType: "gemini",
  label: "backend", pid: 123, parentPid: 100, cwd: "D:\\project", status: "idle",
  connected: true, startedAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
  capabilities: ["inbox", "send", "wait"]
};

describe("wire protocol", () => {
  it("accepts a valid registered session", () => expect(sessionSchema.safeParse(session).success).toBe(true));
  it("rejects public or malformed session data", () => expect(sessionSchema.safeParse({ ...session, pid: -1 }).success).toBe(false));
  it("enforces message limits", () => {
    const result = bridgeMessageSchema.safeParse({ type: "send", requestId: "1", from: "user", to: ["GEM-1234"], content: "x".repeat(20_001) });
    expect(result.success).toBe(false);
  });
});
