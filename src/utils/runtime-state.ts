import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BlackWireConfig } from "../config.js";
import { configSchema, defaultConfig } from "../config.js";
import { runtimePaths } from "./runtime-paths.js";

export interface RuntimeState {
  room: string;
  status: "offline" | "live" | "paused";
  agents: Array<{ id: string; cliType: string; status: string }>;
  turns: number;
  tokens: number;
  updatedAt: string;
}

export async function ensureRuntime(cwd = process.cwd()): Promise<void> {
  const paths = runtimePaths(cwd);
  await Promise.all([mkdir(dirname(paths.log), { recursive: true }), mkdir(paths.artifacts, { recursive: true })]);
  try { await readFile(paths.config, "utf8"); }
  catch { await writeFile(paths.config, JSON.stringify(defaultConfig, null, 2) + "\n", "utf8"); }
}

export async function loadConfig(cwd = process.cwd()): Promise<BlackWireConfig> {
  await ensureRuntime(cwd);
  return configSchema.parse(JSON.parse(await readFile(runtimePaths(cwd).config, "utf8")));
}

export async function saveState(state: RuntimeState, cwd = process.cwd()): Promise<void> {
  await ensureRuntime(cwd);
  await writeFile(runtimePaths(cwd).state, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function loadState(cwd = process.cwd()): Promise<RuntimeState | undefined> {
  try { return JSON.parse(await readFile(runtimePaths(cwd).state, "utf8")) as RuntimeState; }
  catch { return undefined; }
}

export async function logEvent(message: string, cwd = process.cwd()): Promise<void> {
  await ensureRuntime(cwd);
  await appendFile(runtimePaths(cwd).log, `${new Date().toISOString()} ${message.replace(/[\r\n]+/g, " ")}\n`, "utf8");
}
