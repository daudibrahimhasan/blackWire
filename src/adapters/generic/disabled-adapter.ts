import { BaseAdapter } from "../agent-adapter.js";
import type { AgentConfig, AgentInput } from "../../protocol/types.js";

export abstract class DisabledExternalAdapter extends BaseAdapter {
  protected config?: AgentConfig;
  protected abstract readonly cliName: string;

  async start(config: AgentConfig): Promise<void> {
    this.config = config;
    this.setStatus(config.id, "offline");
    throw new Error(`BlackWire will not launch ${this.cliName} automatically. Start it manually and configure a supported adapter connection method.`);
  }
  async send(_message: AgentInput): Promise<void> { throw this.disabledError(); }
  async interrupt(): Promise<void> { throw this.disabledError(); }
  async pause(): Promise<void> { throw this.disabledError(); }
  async resume(): Promise<void> { throw this.disabledError(); }
  async stop(): Promise<void> { this.status = "offline"; }
  private disabledError(): Error { return new Error(`${this.cliName} adapter execution is disabled`); }
}
