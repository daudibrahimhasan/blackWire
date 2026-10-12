import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { BridgeMessage, ServerMessage, SessionRecord } from "../protocol/wire.js";
import { readDaemonInfo } from "./daemon-info.js";

export class DaemonClient {
  private socket?: WebSocket;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly eventHandlers = new Set<(message: Extract<ServerMessage, { type: "event" }>) => void>();
  constructor(private readonly cwd = process.cwd()) {}
  async connect(): Promise<void> {
    const info = await readDaemonInfo(this.cwd);
    if (!info) throw new Error("BlackWire daemon is not running");
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://${info.host}:${info.port}`, { headers: { authorization: `Bearer ${info.token}` } });
      this.socket = socket;
      let settled = false;
      socket.once("open", () => { settled = true; resolve(); });
      // Without a permanent listener, any post-open error is an unhandled 'error' event and kills the process.
      socket.on("error", error => { if (!settled) { settled = true; reject(error); } });
      socket.on("message", data => {
        try { this.receive(JSON.parse(data.toString()) as ServerMessage); }
        catch { socket.close(1002, "Invalid server message"); }
      });
      socket.on("close", () => { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("Daemon disconnected")); } this.pending.clear(); });
    });
  }
  close(): void { this.socket?.close(); }
  onEvent(handler: (message: Extract<ServerMessage, { type: "event" }>) => void): () => void { this.eventHandlers.add(handler); return () => this.eventHandlers.delete(handler); }
  async listSessions(): Promise<SessionRecord[]> { return this.request<SessionRecord[]>({ type: "list_sessions", requestId: randomUUID() }); }
  async subscribe(sessionIds: string[]): Promise<unknown> { return this.request({ type: "subscribe", requestId: randomUUID(), sessionIds }); }
  async send(from: string, to: string[], content: string, messageType = "message"): Promise<unknown> { return this.request({ type: "send", requestId: randomUUID(), from, to, content, messageType }); }
  async inbox(sessionId: string, waitMs = 0): Promise<unknown> { return this.request({ type: "inbox", requestId: randomUUID(), sessionId, waitMs }); }
  async register(session: SessionRecord): Promise<unknown> { return this.request({ type: "register", requestId: randomUUID(), session }); }
  async setStatus(sessionId: string, status: SessionRecord["status"]): Promise<unknown> { return this.request({ type: "set_status", requestId: randomUUID(), sessionId, status }); }
  heartbeat(sessionId: string, status: SessionRecord["status"]): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "heartbeat", sessionId, status }));
  }
  private request<T = unknown>(message: BridgeMessage): Promise<T> {
    if (!("requestId" in message)) throw new Error("Request ID required");
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Daemon client is not connected"));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(message.requestId); reject(new Error("Daemon request timed out")); }, 30_000);
      this.pending.set(message.requestId, { resolve: value => resolve(value as T), reject, timer });
      socket.send(JSON.stringify(message), error => { if (error) { clearTimeout(timer); this.pending.delete(message.requestId); reject(error); } });
    });
  }
  private receive(message: ServerMessage): void {
    if (message.type === "event") { for (const handler of this.eventHandlers) handler(message); return; }
    const pending = this.pending.get(message.requestId); if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.ok) pending.resolve(message.data); else pending.reject(new Error(message.error));
  }
}
