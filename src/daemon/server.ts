import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { bridgeMessageSchema, type InboxMessage, type ServerMessage, type SessionRecord } from "../protocol/wire.js";
import { sanitizeTerminal } from "../security/sanitize.js";
import { runtimePaths } from "../utils/runtime-paths.js";
import { ensureRuntime, logEvent } from "../utils/runtime-state.js";
import { clearDaemonInfo, writeDaemonInfo } from "./daemon-info.js";

interface PersistedRegistry { sessions: SessionRecord[]; inboxes: Record<string, InboxMessage[]>; }

const PERSIST_DEBOUNCE_MS = 250;

/** Prefers the Authorization header; the query parameter is the pre-0.1.1 fallback. */
function suppliedToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const query = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`).searchParams.get("token");
  return query ?? undefined;
}

export class DaemonServer {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly inboxes = new Map<string, InboxMessage[]>();
  private readonly clients = new Set<WebSocket>();
  private readonly clientSession = new Map<WebSocket, string>();
  private readonly subscriptions = new Map<WebSocket, Set<string>>();
  private server?: WebSocketServer;
  private token = "";
  private staleTimer?: NodeJS.Timeout;
  private persistTimer?: NodeJS.Timeout;
  private persistQueue: Promise<void> = Promise.resolve();
  constructor(private readonly port: number, private readonly cwd = process.cwd()) {}

  async start(): Promise<void> {
    await ensureRuntime(this.cwd);
    await this.restore();
    const info = await writeDaemonInfo(this.port, this.cwd);
    this.token = info.token;
    this.server = new WebSocketServer({ host: "127.0.0.1", port: this.port, maxPayload: 1_048_576 });
    this.server.on("connection", (socket, request) => {
      // A browser page on this machine can reach 127.0.0.1 over WebSocket; same-origin
      // policy does not apply. No legitimate BlackWire client sends an Origin header.
      if (request.headers.origin !== undefined) { socket.close(1008, "Forbidden origin"); return; }
      if (!this.authorized(suppliedToken(request))) { socket.close(1008, "Unauthorized"); return; }
      this.clients.add(socket);
      socket.on("message", data => void this.handle(socket, data.toString()));
      socket.on("error", () => socket.terminate());
      socket.on("close", () => this.disconnect(socket));
    });
    try {
      await new Promise<void>((resolve, reject) => {
        this.server!.once("listening", resolve);
        this.server!.once("error", reject);
      });
    } catch (error) {
      await clearDaemonInfo(this.cwd, process.pid);
      throw error;
    }
    this.staleTimer = setInterval(() => void this.expireStale(), 5_000);
    await logEvent(`daemon started pid=${process.pid} port=${this.port}`, this.cwd);
  }

  async stop(): Promise<void> {
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = undefined; }
    for (const client of this.clients) client.close(1001, "Daemon stopping");
    if (this.server) await new Promise<void>((resolve, reject) => this.server!.close(error => error ? reject(error) : resolve()));
    await this.persist();
    await clearDaemonInfo(this.cwd, process.pid);
  }

  private async handle(socket: WebSocket, raw: string): Promise<void> {
    let parsed: ReturnType<typeof bridgeMessageSchema.safeParse>;
    try { parsed = bridgeMessageSchema.safeParse(JSON.parse(raw)); }
    catch { this.respond(socket, "unknown", false, undefined, "Malformed JSON"); return; }
    if (!parsed.success) { this.respond(socket, "unknown", false, undefined, "Invalid message"); return; }
    const message = parsed.data;
    try {
      if (message.type === "register") {
        if (this.clientSession.has(socket)) throw new Error("Socket is already registered");
        if (this.sessions.get(message.session.id)?.connected) throw new Error(`Session ${message.session.id} is already connected`);
        this.sessions.set(message.session.id, { ...message.session, connected: true, lastSeenAt: new Date().toISOString() });
        this.clientSession.set(socket, message.session.id);
        this.inboxes.set(message.session.id, this.inboxes.get(message.session.id) ?? []);
        this.respond(socket, message.requestId, true, { sessionId: message.session.id });
        this.broadcast({ type: "event", event: "sessions_changed", data: this.listSessions() });
      } else if (message.type === "heartbeat") {
        this.requireSocketSession(socket, message.sessionId);
        const session = this.requireSession(message.sessionId);
        this.sessions.set(session.id, { ...session, status: message.status, connected: true, lastSeenAt: new Date().toISOString() });
      } else if (message.type === "list_sessions") {
        this.respond(socket, message.requestId, true, this.listSessions());
      } else if (message.type === "send") {
        const boundSession = this.clientSession.get(socket);
        if (boundSession && boundSession !== message.from) throw new Error("Sender identity does not match registered session");
        const created: InboxMessage[] = [];
        for (const to of message.to) {
          this.requireSession(to);
          const item = { id: randomUUID(), from: message.from, to, content: sanitizeTerminal(message.content), messageType: message.messageType, createdAt: new Date().toISOString() };
          this.inboxes.set(to, [...(this.inboxes.get(to) ?? []), item]);
          created.push(item);
          this.sendMessageEvent(item);
        }
        this.respond(socket, message.requestId, true, created);
      } else if (message.type === "inbox") {
        this.requireSocketSession(socket, message.sessionId);
        const items = this.inboxes.get(message.sessionId) ?? [];
        this.inboxes.set(message.sessionId, []);
        this.respond(socket, message.requestId, true, items);
      } else if (message.type === "set_status") {
        this.requireSocketSession(socket, message.sessionId);
        const session = this.requireSession(message.sessionId);
        this.sessions.set(session.id, { ...session, status: message.status, lastSeenAt: new Date().toISOString() });
        this.respond(socket, message.requestId, true);
        this.broadcast({ type: "event", event: "sessions_changed", data: this.listSessions() });
      } else if (message.type === "subscribe") {
        if (this.clientSession.has(socket)) throw new Error("Registered agent sessions cannot observe room subscriptions");
        message.sessionIds.forEach(id => this.requireSession(id));
        this.subscriptions.set(socket, new Set(message.sessionIds));
        this.respond(socket, message.requestId, true, { subscribed: message.sessionIds });
      }
      this.schedulePersist();
    } catch (error) {
      if ("requestId" in message) this.respond(socket, message.requestId, false, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  private disconnect(socket: WebSocket): void {
    this.clients.delete(socket);
    const id = this.clientSession.get(socket);
    if (id) { const session = this.sessions.get(id); if (session) this.sessions.set(id, { ...session, connected: false, status: "offline", lastSeenAt: new Date().toISOString() }); }
    this.clientSession.delete(socket);
    this.subscriptions.delete(socket);
    this.broadcast({ type: "event", event: "sessions_changed", data: this.listSessions() });
    this.schedulePersist();
  }
  private authorized(supplied: string | undefined): boolean {
    if (!supplied) return false;
    const expected = Buffer.from(this.token, "utf8");
    const actual = Buffer.from(supplied, "utf8");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  private requireSession(id: string): SessionRecord { const value = this.sessions.get(id); if (!value) throw new Error(`Unknown session ${id}`); return value; }
  private requireSocketSession(socket: WebSocket, id: string): void {
    const bound = this.clientSession.get(socket);
    if (bound && bound !== id) throw new Error("Session identity does not match registered socket");
  }
  private listSessions(): SessionRecord[] { return [...this.sessions.values()].sort((a, b) => a.label.localeCompare(b.label)); }
  private respond(socket: WebSocket, requestId: string, ok: boolean, data?: unknown, error?: string): void {
    const payload: ServerMessage = ok ? { type: "response", requestId, ok: true, data } : { type: "response", requestId, ok: false, error: error ?? "Request failed" };
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  }
  private broadcast(payload: ServerMessage): void { const data = JSON.stringify(payload); for (const client of this.clients) if (client.readyState === client.OPEN) client.send(data); }
  private sendMessageEvent(item: InboxMessage): void {
    const data = JSON.stringify({ type: "event", event: "message", data: item } satisfies ServerMessage);
    for (const client of this.clients) {
      const sessionId = this.clientSession.get(client);
      const subscribed = this.subscriptions.get(client);
      const allowed = sessionId === item.from || sessionId === item.to || subscribed?.has(item.from) || subscribed?.has(item.to);
      if (allowed && client.readyState === client.OPEN) client.send(data);
    }
  }
  private async expireStale(): Promise<void> {
    const cutoff = Date.now() - 15_000;
    let changed = false;
    for (const [id, session] of this.sessions) if (session.connected && Date.parse(session.lastSeenAt) < cutoff) { this.sessions.set(id, { ...session, connected: false, status: "offline" }); changed = true; }
    if (changed) { this.broadcast({ type: "event", event: "sessions_changed", data: this.listSessions() }); this.schedulePersist(); }
  }
  /** Coalesces bursts of writes; heartbeats alone would otherwise rewrite the whole registry every 5s per session. */
  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = undefined; void this.persist(); }, PERSIST_DEBOUNCE_MS);
    this.persistTimer.unref();
  }
  private persist(): Promise<void> {
    this.persistQueue = this.persistQueue.catch(() => undefined).then(() => this.writeSnapshot());
    return this.persistQueue;
  }
  private async writeSnapshot(): Promise<void> {
    const data: PersistedRegistry = { sessions: this.listSessions(), inboxes: Object.fromEntries(this.inboxes) };
    const registryPath = runtimePaths(this.cwd).registry;
    const temporaryPath = `${registryPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    await rename(temporaryPath, registryPath);
  }
  private async restore(): Promise<void> {
    const paths = runtimePaths(this.cwd);
    // state.json held the registry before 0.1.1 and is now owned by the room runtime state.
    const data = await this.readRegistry(paths.registry) ?? await this.readRegistry(paths.state);
    if (!data) return;
    for (const session of data.sessions) this.sessions.set(session.id, { ...session, connected: false, status: "offline" });
    for (const [id, inbox] of Object.entries(data.inboxes)) this.inboxes.set(id, inbox);
  }
  private async readRegistry(path: string): Promise<PersistedRegistry | undefined> {
    try {
      const data = JSON.parse(await readFile(path, "utf8")) as Partial<PersistedRegistry>;
      if (!Array.isArray(data.sessions)) return undefined;
      return { sessions: data.sessions, inboxes: data.inboxes ?? {} };
    } catch { return undefined; }
  }
}
