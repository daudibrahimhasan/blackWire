export const AGENT_STATUSES = [
  "offline", "starting", "idle", "thinking", "reading", "working",
  "waiting", "paused", "blocked", "completed", "error"
] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];
export type CommunicationMode = "fast" | "reason" | "deep";
export type Recipient = "a" | "b" | "all" | "room" | "user";
export type MessageType =
  | "message" | "thought" | "hypothesis" | "question" | "disagreement"
  | "evidence" | "decision" | "action" | "result" | "status" | "error";

export interface AgentConfig {
  id: string;
  name: string;
  cliType: "mock" | "codex" | "claude" | string;
  roomId: string;
}

export interface AgentInput {
  id: string;
  roomId: string;
  senderId: string;
  recipient: Recipient;
  type: MessageType;
  content: string;
  references?: string[];
}

export type AgentEvent =
  | { type: "session_started"; agentId: string }
  | { type: "output_chunk"; agentId: string; content: string }
  | { type: "message_completed"; agentId: string; message: AgentInput }
  | { type: "thought_shared"; agentId: string; content: string }
  | { type: "tool_started" | "tool_completed"; agentId: string; tool: string }
  | { type: "waiting_for_input"; agentId: string }
  | { type: "status_changed"; agentId: string; status: AgentStatus }
  | { type: "error"; agentId: string; message: string }
  | { type: "session_ended"; agentId: string };

export interface StoredMessage extends AgentInput {
  tokenEstimate: number;
  artifactReference?: string;
  createdAt: string;
}
