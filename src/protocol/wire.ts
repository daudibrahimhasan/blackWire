import { z } from "zod";
import { AGENT_STATUSES } from "./types.js";

export const sessionSchema = z.object({
  id: z.string().min(1).max(80),
  instanceId: z.string().uuid(),
  cliType: z.enum(["gemini", "claude", "codex", "mock", "unknown"]),
  label: z.string().min(1).max(80),
  pid: z.number().int().positive(),
  parentPid: z.number().int().nonnegative().optional(),
  cwd: z.string().min(1).max(4096),
  status: z.enum(AGENT_STATUSES),
  connected: z.boolean(),
  startedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  capabilities: z.array(z.enum(["inbox", "send", "wait", "status", "artifacts"])).max(20)
});
export type SessionRecord = z.infer<typeof sessionSchema>;

export const bridgeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("register"), requestId: z.string().min(1).max(100), session: sessionSchema }),
  z.object({ type: z.literal("heartbeat"), sessionId: z.string().min(1).max(80), status: z.enum(AGENT_STATUSES) }),
  z.object({ type: z.literal("list_sessions"), requestId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("send"), requestId: z.string().min(1).max(100), from: z.string().min(1).max(80), to: z.array(z.string().min(1).max(80)).min(1).max(64), content: z.string().min(1).max(20_000), messageType: z.string().min(1).max(40).default("message") }),
  z.object({ type: z.literal("inbox"), requestId: z.string().min(1).max(100), sessionId: z.string().min(1).max(80), waitMs: z.number().int().min(0).max(30_000).default(0) }),
  z.object({ type: z.literal("set_status"), requestId: z.string().min(1).max(100), sessionId: z.string().min(1).max(80), status: z.enum(AGENT_STATUSES) }),
  z.object({ type: z.literal("subscribe"), requestId: z.string().min(1).max(100), sessionIds: z.array(z.string().min(1).max(80)).min(1).max(64) })
]);
export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  messageType: string;
  createdAt: string;
}

export type ServerMessage =
  | { type: "response"; requestId: string; ok: true; data?: unknown }
  | { type: "response"; requestId: string; ok: false; error: string }
  | { type: "event"; event: "sessions_changed" | "message"; data: unknown };
