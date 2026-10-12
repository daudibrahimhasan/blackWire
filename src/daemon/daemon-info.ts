import { randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureRuntime } from "../utils/runtime-state.js";
import { runtimePaths } from "../utils/runtime-paths.js";

export interface DaemonInfo { pid: number; host: "127.0.0.1"; port: number; token: string; startedAt: string; root: string; }

export function daemonInfoPath(cwd = process.cwd()): string { return resolve(runtimePaths(cwd).root, "daemon.json"); }
export async function readDaemonInfo(cwd = process.cwd()): Promise<DaemonInfo | undefined> {
  try { return JSON.parse(await readFile(daemonInfoPath(cwd), "utf8")) as DaemonInfo; } catch { return undefined; }
}
export async function writeDaemonInfo(port: number, cwd = process.cwd()): Promise<DaemonInfo> {
  await ensureRuntime(cwd);
  const info: DaemonInfo = { pid: process.pid, host: "127.0.0.1", port, token: randomBytes(32).toString("hex"), startedAt: new Date().toISOString(), root: cwd };
  await writeFile(daemonInfoPath(cwd), JSON.stringify(info, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return info;
}

export async function clearDaemonInfo(cwd = process.cwd(), expectedPid?: number): Promise<void> {
  if (expectedPid !== undefined) {
    const current = await readDaemonInfo(cwd);
    if (current && current.pid !== expectedPid) return;
  }
  try { await unlink(daemonInfoPath(cwd)); } catch { /* already absent */ }
}
