#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { DaemonClient } from "../daemon/client.js";
import type { InboxMessage, SessionRecord } from "../protocol/wire.js";
import { VERSION } from "../version.js";

type JsonRpc = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };
const root = process.env.BLACKWIRE_ROOT || process.cwd();
const cliType = normalizeCli(process.env.BLACKWIRE_CLI_TYPE);
const instanceId = randomUUID();
const sessionId = `${prefix(cliType)}-${instanceId.slice(0, 4).toUpperCase()}`;
const client = new DaemonClient(root);
let status: SessionRecord["status"] = "idle";

await client.connect();
await client.register({ id: sessionId, instanceId, cliType, label: process.env.BLACKWIRE_LABEL || `${cliType}-${process.ppid}`, pid: process.pid, parentPid: process.ppid, cwd: process.cwd(), status, connected: true, startedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), capabilities: ["inbox", "send", "wait", "status", "artifacts"] });
const heartbeat = setInterval(() => client.heartbeat(sessionId, status), 5_000);

// Messages are drained from the daemon into this buffer exactly once, on the daemon's
// own "message" event. Every reader takes from the buffer, so two concurrent readers
// can never drain the daemon inbox on top of each other and lose messages.
const buffered: InboxMessage[] = [];
const waiters = new Set<() => void>();
let drainQueue: Promise<void> = Promise.resolve();
client.onEvent(event => { if (event.event === "message") void drain(); });

const input = createInterface({ input: process.stdin, terminal: false });
input.on("line", line => void handleLine(line));
input.on("close", () => { clearInterval(heartbeat); client.close(); });

async function handleLine(line: string): Promise<void> {
  let request: JsonRpc;
  try { request = JSON.parse(line) as JsonRpc; } catch { return; }
  if (request.method === "notifications/initialized") return;
  try {
    if (request.method === "initialize") return respond(request.id, { protocolVersion: String(request.params?.protocolVersion ?? "2024-11-05"), capabilities: { tools: {} }, serverInfo: { name: "blackwire", version: VERSION }, instructions: `You are connected to BlackWire as ${sessionId}. Check blackwire_inbox when collaborating and use blackwire_send for focused responses.` });
    if (request.method === "tools/list") return respond(request.id, { tools: toolsList() });
    if (request.method === "tools/call") return respond(request.id, await callTool(String(request.params?.name ?? ""), (request.params?.arguments ?? {}) as Record<string, unknown>));
    respondError(request.id, -32601, "Method not found");
  } catch (error) { respondError(request.id, -32000, error instanceof Error ? error.message : String(error)); }
}

async function callTool(name: string, args: Record<string, unknown>) {
  let value: unknown;
  if (name === "blackwire_send") value = await client.send(sessionId, array(args.to), String(args.message ?? ""), String(args.type ?? "message"));
  else if (name === "blackwire_broadcast") {
    const sessions = await client.listSessions(); value = await client.send(sessionId, sessions.filter(x => x.connected && x.id !== sessionId).map(x => x.id), String(args.message ?? ""), String(args.type ?? "message"));
  } else if (name === "blackwire_inbox") value = await takeInbox();
  else if (name === "blackwire_wait") value = await waitForInbox(Number(args.timeout_ms ?? 20_000));
  else if (name === "blackwire_status") value = { self: sessionId, sessions: await client.listSessions() };
  else if (name === "blackwire_set_status") { status = String(args.status ?? "idle") as SessionRecord["status"]; value = await client.setStatus(sessionId, status); }
  else throw new Error(`Unknown tool ${name}`);
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function drain(): Promise<void> {
  drainQueue = drainQueue.catch(() => undefined).then(async () => {
    const items = await client.inbox(sessionId) as InboxMessage[];
    if (!items.length) return;
    buffered.push(...items);
    for (const notify of [...waiters]) notify();
  });
  return drainQueue;
}

async function takeInbox(): Promise<InboxMessage[]> {
  await drain();
  return buffered.splice(0, buffered.length);
}

async function waitForInbox(timeoutMs: number): Promise<InboxMessage[]> {
  const immediate = await takeInbox();
  if (immediate.length) return immediate;
  await new Promise<void>(resolve => {
    const notify = () => { clearTimeout(timer); waiters.delete(notify); resolve(); };
    const timer = setTimeout(notify, Math.min(Math.max(timeoutMs, 0), 30_000));
    waiters.add(notify);
  });
  return takeInbox();
}
function toolsList() { return [
  tool("blackwire_send", "Send a focused message to selected BlackWire sessions.", { to: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, message: { type: "string" }, type: { type: "string" } }, ["to", "message"]),
  tool("blackwire_broadcast", "Send a message to all other connected sessions.", { message: { type: "string" }, type: { type: "string" } }, ["message"]),
  tool("blackwire_inbox", "Read and clear pending BlackWire messages.", {}, []),
  tool("blackwire_wait", "Wait up to 30 seconds for a BlackWire message.", { timeout_ms: { type: "number" } }, []),
  tool("blackwire_status", "List BlackWire sessions and their current status.", {}, []),
  tool("blackwire_set_status", "Update this session's visible BlackWire status.", { status: { type: "string" } }, ["status"])
]; }
function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]) { return { name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } }; }
function array(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : [String(value)]; }
function respond(id: JsonRpc["id"], result: unknown): void { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
function respondError(id: JsonRpc["id"], code: number, message: string): void { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"); }
function normalizeCli(value?: string): SessionRecord["cliType"] { return value === "gemini" || value === "claude" || value === "codex" || value === "mock" ? value : "unknown"; }
function prefix(value: SessionRecord["cliType"]): string { return ({ gemini: "GEM", claude: "CLD", codex: "CDX", mock: "MCK", unknown: "UNK" })[value]; }
