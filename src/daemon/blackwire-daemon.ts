import type { AgentAdapter } from "../adapters/agent-adapter.js";
import type { AgentConfig, AgentInput } from "../protocol/types.js";
import type { BlackWireConfig } from "../config.js";
import { BudgetController } from "./budget-controller.js";
import { MessageRouter } from "./message-router.js";
import { RoomManager } from "./room-manager.js";

export class BlackWireDaemon {
  readonly router = new MessageRouter();
  readonly rooms = new RoomManager();
  readonly budget: BudgetController;
  constructor(readonly config: BlackWireConfig) { this.budget = new BudgetController(config); }
  async registerAgent(config: AgentConfig, adapter: AgentAdapter): Promise<void> {
    this.router.register(config.id, adapter);
    this.rooms.join({ ...config, status: "starting" });
    adapter.onEvent(event => {
      if (event.type === "status_changed") this.rooms.setAgentStatus(event.agentId, event.status);
      if (event.type === "message_completed") void this.send(event.message);
    });
    await adapter.start(config);
  }
  async send(message: AgentInput): Promise<void> {
    const usage = this.budget.consume(message.content, message.senderId !== "user");
    if (usage.paused) throw new Error(usage.reason ?? "Conversation paused");
    await this.router.route(message);
  }
}
