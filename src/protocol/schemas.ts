import { z } from "zod";
import { AGENT_STATUSES } from "./types.js";

export const messageSchema = z.object({
  id: z.string().min(1).max(100),
  roomId: z.string().min(1).max(100),
  senderId: z.string().min(1).max(100),
  recipient: z.enum(["a", "b", "all", "room", "user"]),
  type: z.enum([
    "message", "thought", "hypothesis", "question", "disagreement",
    "evidence", "decision", "action", "result", "status", "error"
  ]),
  content: z.string().min(1).max(20_000),
  references: z.array(z.string().max(500)).max(20).optional()
});

export const registrationSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  cliType: z.string().min(1).max(50),
  roomId: z.string().min(1).max(100),
  status: z.enum(AGENT_STATUSES).default("starting")
});
