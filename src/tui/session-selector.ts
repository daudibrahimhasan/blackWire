import type { DetectedProcess } from "../discovery/process-discovery.js";
import type { SessionRecord } from "../protocol/wire.js";

export interface SelectionResult { selected: SessionRecord[]; cancelled: boolean; }

export async function selectSessions(sessions: SessionRecord[], detected: DetectedProcess[]): Promise<SelectionResult> {
  const connected = sessions.filter(item => item.connected);
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { selected: connected, cancelled: connected.length === 0 };
  if (connected.length === 0) { renderEmpty(detected); return { selected: [], cancelled: true }; }
  return new Promise(resolve => {
    let cursor = 0;
    const selected = new Set<string>();
    const redraw = () => render(connected, detected, cursor, selected);
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", onKey); process.stdout.write("\u001b[?25h\n"); };
    const onKey = (data: Buffer) => {
      const key = data.toString();
      if (key === "\u0003" || key === "\u001b") { cleanup(); resolve({ selected: [], cancelled: true }); return; }
      if (key === "\u001b[A" || key === "k") cursor = (cursor - 1 + connected.length) % connected.length;
      else if (key === "\u001b[B" || key === "j") cursor = (cursor + 1) % connected.length;
      else if (key === " ") { const id = connected[cursor]!.id; selected.has(id) ? selected.delete(id) : selected.add(id); }
      else if (key === "a") { if (selected.size === connected.length) selected.clear(); else connected.forEach(x => selected.add(x.id)); }
      else if (key === "\r" && selected.size > 0) { cleanup(); resolve({ selected: connected.filter(x => selected.has(x.id)), cancelled: false }); return; }
      else if (key === "c") renderConnectionHelp(detected);
      redraw();
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on("data", onKey); process.stdout.write("\u001b[?25l"); redraw();
  });
}

function render(sessions: SessionRecord[], detected: DetectedProcess[], cursor: number, selected: Set<string>): void {
  process.stdout.write("\u001b[2J\u001b[H");
  process.stdout.write("BLACKWIRE — SELECT SESSIONS\n\nCONNECTED\n\n");
  sessions.forEach((item, index) => {
    const pointer = index === cursor ? "❯" : " "; const mark = selected.has(item.id) ? "x" : " ";
    process.stdout.write(`${pointer} [${mark}] ${title(item.cliType)}  • ${item.label.padEnd(14)} • ${shorten(item.cwd, 30).padEnd(30)} • ${item.id}\n`);
  });
  const unavailable = detected.filter(item => !item.connectedSessionId);
  if (unavailable.length) {
    process.stdout.write("\nDETECTED — CONNECTION REQUIRED\n\n");
    unavailable.forEach(item => process.stdout.write(`  [!] ${title(item.cliType)}  • PID ${item.pid} • ${item.cwd ?? "working directory unavailable"}\n`));
  }
  process.stdout.write(`\n${selected.size} selected\n\n↑↓ Move   Space Select   A All   C Connection help   Enter Start   Esc Exit\n`);
}
function renderEmpty(detected: DetectedProcess[]): void {
  process.stdout.write("BLACKWIRE — NO CONNECTED SESSIONS\n\n");
  if (!detected.length) process.stdout.write("No supported AI CLI processes were detected.\n");
  else detected.forEach(item => process.stdout.write(`[!] ${title(item.cliType)} PID ${item.pid} — connection required\n`));
  process.stdout.write("\nRun 'blackwire connect setup', then reload the connector inside each open CLI.\n");
}
function renderConnectionHelp(detected: DetectedProcess[]): void {
  if (!detected.some(item => !item.connectedSessionId)) return;
  process.stdout.write("\u001b[2J\u001b[HCONNECTION HELP\n\nGemini: /mcp reload\nClaude: /reload-plugins\nCodex: restart the session after adding the generated MCP configuration.\n\nBlackWire never injects these commands. Press any navigation key to return.\n");
}
function shorten(value: string, width: number): string { return value.length <= width ? value : `…${value.slice(-(width - 1))}`; }
function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
