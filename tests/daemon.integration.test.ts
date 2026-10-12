import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DaemonClient } from "../src/daemon/client.js";
import { DaemonServer } from "../src/daemon/server.js";
import { saveState } from "../src/utils/runtime-state.js";

describe("daemon integration", () => {
  it("registers sessions and routes inbox messages over authenticated localhost WebSocket", async () => {
    const root = resolve(process.cwd(), ".tmp", `daemon-test-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const port = await availablePort();
    const server = new DaemonServer(port, root);
    await server.start();
    const agent = new DaemonClient(root);
    const operator = new DaemonClient(root);
    try {
      await agent.connect(); await operator.connect();
      const now = new Date().toISOString();
      await agent.register({ id: "GEM-TEST", instanceId: randomUUID(), cliType: "gemini", label: "test", pid: process.pid, parentPid: process.ppid, cwd: root, status: "idle", connected: true, startedAt: now, lastSeenAt: now, capabilities: ["inbox", "send", "wait", "status"] });
      expect(await operator.listSessions()).toHaveLength(1);
      await operator.subscribe(["GEM-TEST"]);
      await operator.send("user", ["GEM-TEST"], "review this", "action");
      expect(await agent.inbox("GEM-TEST")).toMatchObject([{ from: "user", to: "GEM-TEST", content: "review this", messageType: "action" }]);
      expect(await agent.inbox("GEM-TEST")).toEqual([]);
      await expect(agent.send("user", ["GEM-TEST"], "spoofed", "action")).rejects.toThrow("Sender identity");
    } finally { agent.close(); operator.close(); await server.stop(); }
  });

  it("keeps the registry intact when room runtime state is written to the same project", async () => {
    const root = resolve(process.cwd(), ".tmp", `daemon-test-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const first = new DaemonServer(await availablePort(), root);
    await first.start();
    const agent = new DaemonClient(root);
    const operator = new DaemonClient(root);
    try {
      await agent.connect(); await operator.connect();
      const now = new Date().toISOString();
      await agent.register({ id: "GEM-PERSIST", instanceId: randomUUID(), cliType: "gemini", label: "persist", pid: process.pid, parentPid: process.ppid, cwd: root, status: "idle", connected: true, startedAt: now, lastSeenAt: now, capabilities: ["inbox", "send"] });
      await operator.send("user", ["GEM-PERSIST"], "queued while offline", "action");
    } finally { agent.close(); operator.close(); await first.stop(); }

    // `blackwire room` writes RuntimeState; it must not clobber the daemon registry.
    await saveState({ room: "default", status: "offline", agents: [], turns: 0, tokens: 0, updatedAt: new Date().toISOString() }, root);

    const second = new DaemonServer(await availablePort(), root);
    await second.start();
    const reader = new DaemonClient(root);
    try {
      await reader.connect();
      expect(await reader.listSessions()).toMatchObject([{ id: "GEM-PERSIST", connected: false }]);
      expect(await reader.inbox("GEM-PERSIST")).toMatchObject([{ from: "user", content: "queued while offline" }]);
    } finally { reader.close(); await second.stop(); }
  });
});

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
