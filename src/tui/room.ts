import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { MockAdapter } from "../adapters/mock/mock-adapter.js";
import type { AgentAdapter } from "../adapters/agent-adapter.js";
import type { BlackWireConfig } from "../config.js";
import { BlackWireDaemon } from "../daemon/blackwire-daemon.js";
import type { Recipient } from "../protocol/types.js";
import { logEvent, saveState } from "../utils/runtime-state.js";
import { TerminalView, type DisplayOptions } from "./terminal.js";

export async function runRoom(name: string, config: BlackWireConfig, options: DisplayOptions): Promise<void> {
  const view = new TerminalView(options);
  const daemon = new BlackWireDaemon(config);
  const adapters = new Map<string, AgentAdapter>();
  daemon.rooms.create({ id: name, name, mode: config.mode, status: "live", maxTurns: config.maxAgentTurns, tokenBudget: config.maxTotalTokens, animationEnabled: options.animation });
  for (const id of ["a", "b"] as const) {
    const adapter = new MockAdapter();
    adapters.set(id, adapter);
    adapter.onEvent(event => {
      if (event.type === "message_completed") view.line(id.toUpperCase(), event.message.content, event.message.type.toUpperCase());
    });
    await daemon.registerAgent({ id, name: id.toUpperCase(), cliType: "mock", roomId: name }, adapter);
  }
  let target: Recipient = "all";
  await updateState("live");
  view.clear();
  view.header(name, config.mode, "● IDLE", "● IDLE", usage());
  view.line("SYSTEM", "Mock room ready. Type /help for commands.", "STATUS");
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const raw = (await input.question(`[${target}] > `)).trim();
      if (!raw) continue;
      if (raw === "/quit") break;
      if (await command(raw)) continue;
      let recipient: Recipient = target;
      let content = raw;
      const routed = raw.match(/^(?:@|\/)(a|b|all)\s+(.+)$/i);
      if (routed) { recipient = routed[1]!.toLowerCase() as Recipient; content = routed[2]!; }
      view.line("YOU", content, recipientLabel(recipient));
      try {
        await daemon.send({ id: randomUUID(), roomId: name, senderId: "user", recipient, type: "message", content });
        await logEvent(`user>${recipient} ${content}`);
        await updateState(daemon.budget.snapshot().paused ? "paused" : "live");
      } catch (error) { view.line("SYSTEM", error instanceof Error ? error.message : String(error), "ERROR"); }
    }
  } finally {
    input.close();
    await updateState("offline");
    view.line("SYSTEM", "Channel closed.", "STATUS");
  }

  async function command(raw: string): Promise<boolean> {
    const [cmd = "", arg] = raw.split(/\s+/, 2);
    if (cmd === "/help") { view.line("SYSTEM", "/a /b /all, /status, /agents, /pause, /resume, /interrupt, /clear, /log, /quit", "HELP"); return true; }
    if (["/a", "/b", "/all"].includes(cmd) && !arg) { target = cmd.slice(1) as Recipient; view.line("SYSTEM", `Target set to ${target}.`, "STATUS"); return true; }
    if (["/a", "/b", "/all"].includes(cmd) && arg) return false;
    if (cmd === "/status") { view.line("SYSTEM", usage(), "STATUS"); return true; }
    if (cmd === "/agents") { view.line("SYSTEM", daemon.rooms.listAgents(name).map(a => `${a.id}:${a.status}`).join("  "), "AGENTS"); return true; }
    if (cmd === "/clear") { view.clear(); view.header(name, config.mode, "● IDLE", "● IDLE", usage()); return true; }
    if (["/pause", "/resume", "/interrupt"].includes(cmd)) {
      const action = cmd.slice(1) as "pause" | "resume" | "interrupt";
      const selected = arg === "a" || arg === "b" ? [arg] : [...adapters.keys()];
      await Promise.all(selected.map(id => adapters.get(id)![action]()));
      if (action === "resume") daemon.budget.resume();
      view.line("SYSTEM", `${action} applied to ${arg ?? "all"}.`, "STATUS");
      await updateState(action === "pause" ? "paused" : "live");
      return true;
    }
    if (cmd === "/mode" && ["fast", "reason", "deep"].includes(arg ?? "")) {
      config.mode = arg as BlackWireConfig["mode"];
      view.line("SYSTEM", `Mode changed to ${config.mode.toUpperCase()}.`, "STATUS");
      return true;
    }
    if (cmd === "/budget" || cmd === "/max-turns") {
      view.line("SYSTEM", "Budget values are configured in .blackwire/config.json and apply when a room opens.", "STATUS");
      return true;
    }
    if (cmd === "/animation" && (arg === "on" || arg === "off")) {
      view.options.animation = arg === "on";
      view.line("SYSTEM", `Animation ${arg}.`, "STATUS");
      return true;
    }
    if (cmd === "/log") { view.line("SYSTEM", ".blackwire/logs/blackwire.log", "LOG"); return true; }
    if (cmd.startsWith("/")) { view.line("SYSTEM", `Unknown command: ${cmd}`, "WARNING"); return true; }
    return false;
  }
  function usage(): string { const x = daemon.budget.snapshot(); return `TURNS ${x.turns}/${config.maxAgentTurns} | TOKENS ~${x.estimatedTokens}/${config.maxTotalTokens}`; }
  function recipientLabel(recipient: Recipient): string { return recipient === "all" ? "BROADCAST" : `TO ${recipient.toUpperCase()}`; }
  async function updateState(status: "offline" | "live" | "paused"): Promise<void> {
    const x = daemon.budget.snapshot();
    await saveState({ room: name, status, agents: daemon.rooms.listAgents(name).map(a => ({ id: a.id, cliType: a.cliType, status: a.status })), turns: x.turns, tokens: x.estimatedTokens, updatedAt: new Date().toISOString() });
  }
}
