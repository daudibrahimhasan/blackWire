import { EventEmitter } from "node:events";
import type { AgentAdapter } from "../adapters/agent-adapter.js";
import type { AgentInput } from "../protocol/types.js";
import { messageSchema } from "../protocol/schemas.js";
import { sanitizeTerminal } from "../security/sanitize.js";

export class MessageRouter extends EventEmitter {
  private readonly agents = new Map<string, AgentAdapter>();
  register(id: string, adapter: AgentAdapter): void {
    if (this.agents.has(id)) throw new Error(`Agent ${id} is already registered`);
    this.agents.set(id, adapter);
  }
  unregister(id: string): void { this.agents.delete(id); }
  async route(input: AgentInput): Promise<void> {
    const message = messageSchema.parse({ ...input, content: sanitizeTerminal(input.content) });
    this.emit("message", message);
    const recipients = message.recipient === "all"
      ? [...this.agents.entries()].filter(([id]) => id !== message.senderId)
      : [[message.recipient, this.agents.get(message.recipient)] as const];
    for (const [id, adapter] of recipients) {
      if (!adapter) { this.emit("undeliverable", { message, recipient: id }); continue; }
      await adapter.send(message);
    }
  }
}
