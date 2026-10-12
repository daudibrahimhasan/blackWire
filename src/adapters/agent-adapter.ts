import type { AgentConfig, AgentEvent, AgentInput, AgentStatus } from "../protocol/types.js";

export interface AgentAdapter {
  start(config: AgentConfig): Promise<void>;
  send(message: AgentInput): Promise<void>;
  interrupt(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): AgentStatus;
  onEvent(handler: (event: AgentEvent) => void): () => void;
}

export abstract class BaseAdapter implements AgentAdapter {
  protected status: AgentStatus = "offline";
  private readonly handlers = new Set<(event: AgentEvent) => void>();

  abstract start(config: AgentConfig): Promise<void>;
  abstract send(message: AgentInput): Promise<void>;
  abstract interrupt(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract resume(): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): AgentStatus { return this.status; }
  onEvent(handler: (event: AgentEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  protected emit(event: AgentEvent): void { for (const handler of this.handlers) handler(event); }
  protected setStatus(agentId: string, status: AgentStatus): void {
    this.status = status;
    this.emit({ type: "status_changed", agentId, status });
  }
}
