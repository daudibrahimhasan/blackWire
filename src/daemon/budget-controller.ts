import type { BlackWireConfig } from "../config.js";

export interface BudgetSnapshot { turns: number; estimatedTokens: number; paused: boolean; reason?: string; }

export class BudgetController {
  private turns = 0;
  private tokens = 0;
  private paused = false;
  private reason?: string;
  constructor(private readonly config: BlackWireConfig) {}

  estimateTokens(content: string): number { return Math.max(1, Math.ceil(content.length / 4)); }
  consume(content: string, agentTurn = true): BudgetSnapshot {
    const estimate = this.estimateTokens(content);
    if (estimate > this.config.maxTokensPerMessage) throw new Error("Message token estimate exceeds per-message limit");
    if (this.tokens + estimate > this.config.maxTotalTokens) return this.pause("Total token budget reached");
    if (agentTurn && this.turns + 1 > this.config.maxAgentTurns) return this.pause("Maximum agent turns reached");
    this.tokens += estimate;
    if (agentTurn) this.turns += 1;
    if (agentTurn && this.turns % this.config.pauseForUserAfter === 0) return this.pause("Waiting for user review");
    return this.snapshot();
  }
  resume(): void { this.paused = false; this.reason = undefined; }
  snapshot(): BudgetSnapshot { return { turns: this.turns, estimatedTokens: this.tokens, paused: this.paused, reason: this.reason }; }
  private pause(reason: string): BudgetSnapshot { this.paused = true; this.reason = reason; return this.snapshot(); }
}
