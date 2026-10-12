import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DaemonClient } from "../../daemon/client.js";

export async function runMockSession(label: string, cwd = process.cwd()): Promise<void> {
  const client = new DaemonClient(cwd);
  await client.connect();
  const id = `MCK-${randomUUID().slice(0, 4).toUpperCase()}`;
  const now = new Date().toISOString();
  await client.register({
    id, instanceId: randomUUID(), cliType: "mock", label, pid: process.pid, parentPid: process.ppid,
    cwd, status: "idle", connected: true, startedAt: now, lastSeenAt: now,
    capabilities: ["inbox", "send", "wait", "status"]
  });

  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const heartbeat = setInterval(() => client.heartbeat(id, "idle"), 5_000);
  console.log(`BlackWire mock session ${label} linked as ${id}. Press Ctrl+C to stop.`);
  try {
    while (!stopping) {
      const inbox = await client.inbox(id) as Array<{ content: string }>;
      for (const item of inbox) {
        const peers = (await client.listSessions()).filter(session => session.connected && session.id !== id).map(session => session.id);
        if (peers.length) await client.send(id, peers, `Mock response to: ${item.content}`, "result");
      }
      await delay(250);
    }
    await client.setStatus(id, "offline");
  } finally {
    clearInterval(heartbeat);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    client.close();
  }
}
