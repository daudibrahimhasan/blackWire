import { z } from "zod";

export const configSchema = z.object({
  host: z.literal("127.0.0.1").default("127.0.0.1"),
  port: z.number().int().min(1024).max(65535).default(4737),
  mode: z.enum(["fast", "reason", "deep"]).default("fast"),
  maxAgentTurns: z.number().int().positive().default(8),
  maxTokensPerMessage: z.number().int().positive().default(300),
  maxTotalTokens: z.number().int().positive().default(5000),
  pauseForUserAfter: z.number().int().positive().default(4),
  animationEnabled: z.boolean().default(true),
  telemetry: z.literal(false).default(false)
});

export type BlackWireConfig = z.infer<typeof configSchema>;
export const defaultConfig: BlackWireConfig = configSchema.parse({});
