import { BaseAdapter } from "../agent-adapter.js";
import type { AgentConfig, AgentInput } from "../../protocol/types.js";

export class MockAdapter extends BaseAdapter {
  private config?: AgentConfig;

  async start(config: AgentConfig): Promise<void> {
    this.config = config;
    this.setStatus(config.id, "idle");
    this.emit({ type: "session_started", agentId: config.id });
  }

  async send(message: AgentInput): Promise<void> {
    const agent = this.requireAgent();
    if (this.status === "paused") throw new Error(`Agent ${agent.id} is paused`);
    this.setStatus(agent.id, "thinking");
    const response: AgentInput = {
      id: `${message.id}:mock`, roomId: message.roomId, senderId: agent.id,
      recipient: message.senderId === "user" ? "room" : "user", type: "result",
      content: `Mock response to: ${message.content}`, references: message.references
    };
    this.emit({ type: "message_completed", agentId: agent.id, message: response });
    this.setStatus(agent.id, "idle");
  }

  async interrupt(): Promise<void> { this.setStatus(this.requireAgent().id, "waiting"); }
  async pause(): Promise<void> { this.setStatus(this.requireAgent().id, "paused"); }
  async resume(): Promise<void> { this.setStatus(this.requireAgent().id, "idle"); }
  async stop(): Promise<void> {
    const id = this.requireAgent().id;
    this.setStatus(id, "offline");
    this.emit({ type: "session_ended", agentId: id });
  }
  private requireAgent(): AgentConfig {
    if (!this.config) throw new Error("Mock adapter has not been started");
    return this.config;
  }
}
