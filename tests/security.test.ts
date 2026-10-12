import { describe, expect, it } from "vitest";
import { redactSecrets, sanitizeTerminal } from "../src/security/sanitize.js";

describe("terminal security", () => {
  it("removes ANSI control sequences", () => expect(sanitizeTerminal("safe\u001b[2Junsafe")).toBe("safeunsafe"));
  it("removes control characters", () => expect(sanitizeTerminal("a\u0000b")).toBe("ab"));
  it("redacts common secrets", () => expect(redactSecrets("api_key=abcdef token:xyz")).toBe("api_key=[REDACTED] token=[REDACTED]"));
});
