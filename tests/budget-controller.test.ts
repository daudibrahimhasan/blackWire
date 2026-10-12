import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { BudgetController } from "../src/daemon/budget-controller.js";

describe("BudgetController", () => {
  it("estimates approximately four characters per token", () => {
    expect(new BudgetController(defaultConfig).estimateTokens("12345678")).toBe(2);
  });
  it("pauses for user review at the configured interval", () => {
    const budget = new BudgetController({ ...defaultConfig, pauseForUserAfter: 2 });
    budget.consume("one");
    expect(budget.consume("two")).toMatchObject({ paused: true, turns: 2, reason: "Waiting for user review" });
  });
  it("rejects oversized messages", () => {
    const budget = new BudgetController({ ...defaultConfig, maxTokensPerMessage: 1 });
    expect(() => budget.consume("12345678")).toThrow(/per-message/);
  });
});
