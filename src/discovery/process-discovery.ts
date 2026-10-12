import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionRecord } from "../protocol/wire.js";

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 3_000;
let cache: { at: number; processes: DetectedProcess[] } | undefined;

export interface DetectedProcess { pid: number; cliType: "gemini" | "claude" | "codex"; command: string; cwd?: string; connectedSessionId?: string; }

export async function discoverCliProcesses(connected: SessionRecord[] = []): Promise<DetectedProcess[]> {
  // Enumerating every process is expensive on Windows (a PowerShell CIM query); the CLI
  // hits this on sessions, status, and room launch, so reuse a recent scan.
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    cache = { at: Date.now(), processes: process.platform === "win32" ? await discoverWindows() : await discoverPosix() };
  }
  return cache.processes.map(item => ({ ...item, connectedSessionId: connected.find(session => session.pid === item.pid || session.parentPid === item.pid)?.id }));
}

async function discoverWindows(): Promise<DetectedProcess[]> {
  const script = "$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(gemini|claude|codex)(\\.exe|\\.cmd)?$' -or $_.CommandLine -match '(^|[\\\\/ ])(gemini|claude|codex)(\\.js|\\.exe|\\.cmd)?([ \"]|$)' } | Select-Object ProcessId,Name,CommandLine; $items | ConvertTo-Json -Compress";
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 5_000, maxBuffer: 1_000_000 });
    if (!stdout.trim()) return [];
    const raw = JSON.parse(stdout) as Record<string, unknown> | Array<Record<string, unknown>>;
    return (Array.isArray(raw) ? raw : [raw]).flatMap(normalize);
  } catch { return []; }
}

async function discoverPosix(): Promise<DetectedProcess[]> {
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="], { timeout: 5_000, maxBuffer: 1_000_000 });
    return stdout.split("\n").flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/); if (!match) return [];
      const cliType = identify(match[2]!); return cliType ? [{ pid: Number(match[1]), cliType, command: match[2]! }] : [];
    });
  } catch { return []; }
}

function normalize(value: Record<string, unknown>): DetectedProcess[] {
  const command = String(value.CommandLine ?? value.Name ?? "");
  const cliType = identify(command); if (!cliType) return [];
  return [{ pid: Number(value.ProcessId), cliType, command }];
}

/**
 * Matches the launched executable, or a script argument named after a supported CLI.
 * Deliberately does not match the bare word anywhere in the command line: paths such as
 * `code D:\Projects\claude notes` are not Claude sessions.
 */
export function identify(command: string): DetectedProcess["cliType"] | undefined {
  const [executable, ...rest] = tokenize(command);
  if (executable) {
    const name = baseName(executable).replace(/\.(exe|cmd|bat|ps1)$/, "");
    if (name === "gemini" || name === "claude" || name === "codex") return name;
  }
  for (const argument of rest) {
    const script = baseName(argument).match(/^(gemini|claude|codex)\.(?:js|mjs|cjs)$/);
    if (script) return script[1] as DetectedProcess["cliType"];
  }
  return undefined;
}
function tokenize(command: string): string[] {
  return (command.toLowerCase().match(/"[^"]*"|\S+/g) ?? []).map(token => token.replace(/^"|"$/g, ""));
}
function baseName(value: string): string { return value.split(/[\\/]/).pop() ?? ""; }
