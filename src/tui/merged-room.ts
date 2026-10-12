import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import type { DaemonClient } from "../daemon/client.js";
import type { InboxMessage, SessionRecord } from "../protocol/wire.js";
import { sanitizeTerminal } from "../security/sanitize.js";
import { TerminalView, type DisplayOptions } from "./terminal.js";

export async function runMergedRoom(client: DaemonClient, initial: SessionRecord[], options: DisplayOptions): Promise<void> {
  const view = new TerminalView(options);
  let sessions = initial;
  let targets = new Set(initial.map(x => x.id));
  let turns = 0;
  let tokens = 0;
  await client.subscribe(initial.map(session => session.id));
  view.clear(); renderHeader();
  view.line("SYSTEM", `${sessions.length} sessions linked. Use @label, @session-id, or @all.`, "STATUS");
  const unsubscribe = client.onEvent(event => {
    if (event.event === "message") {
      const item = event.data as InboxMessage;
      if (sessions.some(x => x.id === item.from || x.id === item.to)) { turns += 1; tokens += Math.ceil(item.content.length / 4); view.line(label(item.from), item.content, item.messageType.toUpperCase()); }
    } else if (event.event === "sessions_changed") {
      const all = event.data as SessionRecord[];
      sessions = sessions.map(old => all.find(x => x.id === old.id) ?? { ...old, connected: false, status: "offline" });
    }
  });
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const raw = (await input.question(`[${targetText()}] > `)).trim();
      if (!raw) continue;
      if (raw === "/quit") break;
      if (command(raw)) continue;
      let content = raw;
      let recipients = [...targets];
      const routed = raw.match(/^@([^\s]+)\s+(.+)$/);
      if (routed) { content = routed[2]!; recipients = resolveTargets(routed[1]!); }
      if (!recipients.length) { view.line("SYSTEM", "No matching connected target.", "WARNING"); continue; }
      view.line("YOU", content, recipients.length === sessions.length ? "BROADCAST" : `TO ${recipients.map(label).join(",")}`);
      try { await client.send("user", recipients, sanitizeTerminal(content)); tokens += Math.ceil(content.length / 4); }
      catch (error) { view.line("SYSTEM", error instanceof Error ? error.message : String(error), "ERROR"); }
    }
  } finally { unsubscribe(); input.close(); view.line("SYSTEM", "Room closed. Agent sessions remain independent.", "STATUS"); }

  function command(raw: string): boolean {
    if (raw === "/help") { view.line("SYSTEM", "@label message | @all message | /sessions | /target name[,name] | /status | /clear | /quit", "HELP"); return true; }
    if (raw === "/sessions") { sessions.forEach(x => view.line("SYSTEM", `${x.id} ${x.cliType} ${x.label} ${x.connected ? x.status : "offline"}`, "SESSION")); return true; }
    if (raw === "/status") { view.line("SYSTEM", `${sessions.filter(x => x.connected).length}/${sessions.length} connected | TURNS ${turns} | TOKENS ~${tokens}`, "STATUS"); return true; }
    if (raw === "/clear") { view.clear(); renderHeader(); return true; }
    if (raw.startsWith("/target ")) { const next = raw.slice(8).split(",").flatMap(resolveTargets); targets = new Set(next); view.line("SYSTEM", `Targets: ${targetText()}`, "STATUS"); return true; }
    if (raw.startsWith("/")) { view.line("SYSTEM", `Unknown command ${raw.split(" ")[0]}`, "WARNING"); return true; }
    return false;
  }
  function resolveTargets(value: string): string[] {
    if (value.toLowerCase() === "all") return sessions.filter(x => x.connected).map(x => x.id);
    const needle = value.toLowerCase(); return sessions.filter(x => x.connected && (x.id.toLowerCase() === needle || x.label.toLowerCase() === needle)).map(x => x.id);
  }
  function label(id: string): string { const item = sessions.find(x => x.id === id); return item?.label ?? id; }
  function targetText(): string { return targets.size === sessions.length ? "all" : [...targets].map(label).join(","); }
  function renderHeader(): void {
    process.stdout.write("BLACKWIRE  ROOM MERGED  LINK LIVE\n");
    sessions.forEach(x => process.stdout.write(`${x.connected ? "●" : "○"} ${x.id.padEnd(10)} ${x.cliType.padEnd(7)} ${x.label}  ${x.status.toUpperCase()}\n`));
    process.stdout.write(`TURNS ${turns} | TOKENS ~${tokens}\n${"─".repeat(Math.min(process.stdout.columns || 72, 100))}\n`);
  }
}
