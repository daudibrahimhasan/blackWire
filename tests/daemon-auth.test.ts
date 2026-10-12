import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";
import { DaemonClient } from "../src/daemon/client.js";
import { readDaemonInfo } from "../src/daemon/daemon-info.js";
import { DaemonServer } from "../src/daemon/server.js";

describe("daemon authentication", () => {
  it("rejects wrong tokens, missing tokens, and browser origins", async () => {
    const root = resolve(process.cwd(), ".tmp", `daemon-auth-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const port = await availablePort();
    const server = new DaemonServer(port, root);
    await server.start();
    const info = await readDaemonInfo(root);
    const url = `ws://127.0.0.1:${port}`;
    try {
      expect(info?.token).toBeTruthy();
      expect(await closeCode(url, { headers: { authorization: "Bearer wrong-token" } })).toBe(1008);
      expect(await closeCode(url)).toBe(1008);
      // A valid token from a browser page is still refused: same-origin policy does not
      // protect localhost WebSockets, and no real client sends Origin.
      expect(await closeCode(url, { headers: { authorization: `Bearer ${info!.token}`, origin: "http://attacker.example" } })).toBe(1008);
    } finally { await server.stop(); }
  });

  it("delivers message events only to the sender, the recipient, and explicit subscribers", async () => {
    const root = resolve(process.cwd(), ".tmp", `daemon-scope-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const server = new DaemonServer(await availablePort(), root);
    await server.start();
    const first = new DaemonClient(root);
    const second = new DaemonClient(root);
    const observer = new DaemonClient(root);
    const operator = new DaemonClient(root);
    try {
      await first.connect(); await second.connect(); await observer.connect(); await operator.connect();
      await first.register(session("GEM-ONE", root));
      await second.register(session("GEM-TWO", root));
      await observer.subscribe(["GEM-ONE"]);

      const seen: string[] = [];
      observer.onEvent(event => { if (event.event === "message") seen.push((event.data as { to: string }).to); });

      await operator.send("user", ["GEM-TWO"], "not for the observer");
      await operator.send("user", ["GEM-ONE"], "for the observer");
      await new Promise(done => setTimeout(done, 300));

      expect(seen).toEqual(["GEM-ONE"]);
    } finally { first.close(); second.close(); observer.close(); operator.close(); await server.stop(); }
  });
});

function session(id: string, cwd: string) {
  const now = new Date().toISOString();
  return { id, instanceId: randomUUID(), cliType: "gemini" as const, label: id.toLowerCase(), pid: process.pid, parentPid: process.ppid, cwd, status: "idle" as const, connected: true, startedAt: now, lastSeenAt: now, capabilities: ["inbox" as const, "send" as const] };
}

function closeCode(url: string, options?: WebSocket.ClientOptions): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(url, options);
    socket.on("close", code => resolvePromise(code));
    socket.on("error", reject);
  });
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("No test port")); return; }
      const port = address.port; server.close(() => resolvePort(port));
    });
  });
}
