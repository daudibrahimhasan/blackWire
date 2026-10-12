import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { resolve } from "node:path";
import { runtimePaths } from "../utils/runtime-paths.js";

const agentSchema = z.object({
  id: z.string().min(1).max(30),
  label: z.string().min(1).max(50),
  provider: z.enum(["openai", "anthropic", "gemini", "openai-compatible"]),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  maxOutputTokens: z.number().int().min(50).max(4000).default(500)
});

export const apiDemoConfigSchema = z.object({
  agents: z.array(agentSchema).length(5),
  requestTimeoutMs: z.number().int().min(1000).max(300_000).default(180_000),
  maxSharedCharacters: z.number().int().min(1000).max(100_000).default(20_000)
});
export type ApiDemoConfig = z.infer<typeof apiDemoConfigSchema>;
export type ApiDemoAgent = ApiDemoConfig["agents"][number];

export function apiDemoConfigPath(cwd = process.cwd()): string { return resolve(runtimePaths(cwd).root, "api-demo.json"); }
export function apiDemoEnvPath(cwd = process.cwd()): string { return resolve(runtimePaths(cwd).root, "api-demo.env"); }

export async function loadApiDemoEnv(cwd = process.cwd()): Promise<void> {
  let content: string;
  try { content = await readFile(apiDemoEnvPath(cwd), "utf8"); } catch { return; }
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("="); if (equals < 1) continue;
    const name = line.slice(0, equals).trim(); const value = line.slice(equals + 1).trim();
    if (/^[A-Z][A-Z0-9_]*$/.test(name) && value && process.env[name] === undefined) process.env[name] = value;
  }
}

export async function loadOrCreateApiDemoConfig(cwd = process.cwd()): Promise<{ config?: ApiDemoConfig; created: boolean; path: string }> {
  const path = apiDemoConfigPath(cwd);
  try { return { config: apiDemoConfigSchema.parse(JSON.parse(await readFile(path, "utf8"))), created: false, path }; }
  catch (error) {
    if (error instanceof z.ZodError) throw new Error(`Invalid API demo configuration:\n${error.issues.map(x => `- ${x.path.join(".")}: ${x.message}`).join("\n")}`);
    await mkdir(runtimePaths(cwd).root, { recursive: true });
    await writeFile(path, JSON.stringify(template(), null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return { created: true, path };
  }
}

function template(): ApiDemoConfig {
  return {
    requestTimeoutMs: 60_000,
    maxSharedCharacters: 1_200,
    agents: [
      { id: "model-1", label: "Model A", provider: "openai", model: "YOUR_OPENAI_MODEL", apiKeyEnv: "OPENAI_API_KEY", maxOutputTokens: 500 },
      { id: "model-2", label: "Model B", provider: "openai-compatible", model: "YOUR_SECOND_MODEL", apiKeyEnv: "MODEL2_API_KEY", baseUrl: "https://YOUR-ENDPOINT.example/v1", maxOutputTokens: 500 },
      { id: "model-3", label: "Model C", provider: "anthropic", model: "YOUR_ANTHROPIC_MODEL", apiKeyEnv: "ANTHROPIC_API_KEY", maxOutputTokens: 500 },
      { id: "model-4", label: "Model D", provider: "gemini", model: "YOUR_GEMINI_MODEL", apiKeyEnv: "GEMINI_API_KEY", maxOutputTokens: 500 },
      { id: "model-5", label: "Model E", provider: "openai-compatible", model: "YOUR_MODEL", apiKeyEnv: "MODEL5_API_KEY", baseUrl: "https://YOUR-ENDPOINT.example/v1", maxOutputTokens: 500 }
    ]
  };
}
