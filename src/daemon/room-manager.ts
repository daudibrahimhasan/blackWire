import type { CommunicationMode, AgentStatus } from "../protocol/types.js";

export interface RoomState {
  id: string; name: string; mode: CommunicationMode; status: "live" | "paused" | "closed";
  maxTurns: number; tokenBudget: number; animationEnabled: boolean;
}
export interface AgentState { id: string; name: string; cliType: string; status: AgentStatus; roomId: string; }

export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();
  private readonly agents = new Map<string, AgentState>();
  create(room: RoomState): RoomState {
    if (this.rooms.has(room.id)) throw new Error(`Room ${room.id} already exists`);
    this.rooms.set(room.id, room); return room;
  }
  join(agent: AgentState): void {
    if (!this.rooms.has(agent.roomId)) throw new Error(`Room ${agent.roomId} does not exist`);
    this.agents.set(agent.id, agent);
  }
  setAgentStatus(id: string, status: AgentStatus): void {
    const agent = this.agents.get(id); if (!agent) throw new Error(`Unknown agent ${id}`);
    this.agents.set(id, { ...agent, status });
  }
  getRoom(id: string): RoomState | undefined { return this.rooms.get(id); }
  listAgents(roomId: string): AgentState[] { return [...this.agents.values()].filter(a => a.roomId === roomId); }
}
