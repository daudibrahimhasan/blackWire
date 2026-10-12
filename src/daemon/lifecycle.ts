import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { DaemonClient } from "./client.js";
import { clearDaemonInfo, readDaemonInfo } from "./daemon-info.js";

export async function daemonRunning(cwd = process.cwd()): Promise<boolean> {
  const client = new DaemonClient(cwd);
  try { await client.connect(); await client.listSessions(); client.close(); return true; } catch { client.close(); return false; }
}

export async function startDaemon(cwd = process.cwd()): Promise<void> {
  if (await daemonRunning(cwd)) return;
  const entry = process.argv[1];
  if (!entry) throw new Error("Cannot locate the BlackWire executable");
  const child = spawn(process.execPath, [entry, "daemon", "serve", "--root", cwd], { cwd, detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, BLACKWIRE_ROOT: cwd } });
  child.unref();
  for (let attempt = 0; attempt < 30; attempt += 1) { await delay(100); if (await daemonRunning(cwd)) return; }
  throw new Error("BlackWire daemon did not become ready");
}

export async function stopDaemon(cwd = process.cwd()): Promise<boolean> {
  const info = await readDaemonInfo(cwd); if (!info) return false;
  // A stale daemon.json can name a PID the OS has since reused. Only signal a process that
  // still answers on the recorded endpoint with the recorded token.
  if (!await daemonRunning(cwd)) { await clearDaemonInfo(cwd, info.pid); return false; }
  try { process.kill(info.pid, "SIGTERM"); } catch { /* already stopped */ }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { process.kill(info.pid, 0); await delay(100); }
    catch { break; }
  }
  await clearDaemonInfo(cwd, info.pid);
  return true;
}
