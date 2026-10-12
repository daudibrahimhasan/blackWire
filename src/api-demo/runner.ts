import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { sanitizeTerminal } from "../security/sanitize.js";
import { loadApiDemoEnv, loadOrCreateApiDemoConfig } from "./config.js";
import { conductDiscussion, MAX_ROUNDS } from "./discussion.js";
import { TerminalView, type DisplayOptions } from "../tui/terminal.js";
import { startHackerSidecar } from "../tui/hacker-sidecar.js";

export async function runApiDemo(options: DisplayOptions, suppliedTask?: string): Promise<void> {
  await loadApiDemoEnv();
  const loaded = await loadOrCreateApiDemoConfig();
  if (loaded.created || !loaded.config) {
    console.log(`API demo configuration created:\n${loaded.path}\n\nEdit the five model entries and set their API-key environment variables, then run 'blackwire --demo' again.`);
    return;
  }
  const config = loaded.config;
  let task = suppliedTask?.trim();
  if (!task) {
    if (!process.stdin.isTTY) throw new Error("Provide a task with --task or --file when input is not interactive");
    task = (await promptForTask()).trim();
  }
  if (!task) throw new Error("A demo task is required");
  if (task.length > 50_000) throw new Error("Demo task is limited to 50,000 characters");
  const view = new TerminalView(options);
  renderBanner(view, config.agents.map(agent => ({ label: agent.label, model: agent.model })));
  let sidecar: { stop(): void } = { stop: () => undefined };
  try {
    await renderCard(view, "YOU", task, "TASK", "red", false);
    const startedAt = Date.now();
    await renderCard(view, "SYSTEM", "Open floor active. Models A–E decide when to speak; silence is allowed and discrepancies take priority.", "DISCUSS", "gray", false);
    const cardWidth = Math.min(Math.max(process.stdout.columns || 78, 60), 80);
    sidecar = startHackerSidecar(options, cardWidth);
    const result = await conductDiscussion(config, task, {
      thinking: round => spinner(view, round === 0 ? "MODELS FORGING FINAL VERDICT" : `LIVE DEBATE  •  PASS ${round}/${MAX_ROUNDS}  •  PARALLEL ANALYSIS`, options.animation),
      nodeEvent: (agentIndex, event, latencyMs, kind) => {
        if (!process.stdout.isTTY || options.plain) return;
        const agent = config.agents[agentIndex];
        const letter = String.fromCharCode(65 + agentIndex);
        const addr = NODE_ADDRS[agentIndex] ?? "0x0000";
        if (event === "ready") {
          process.stdout.write(`\r\u001b[2K  ${view.color("⚡", "green")} [${addr}] [${letter}] ${(agent?.label ?? letter).padEnd(12)} >> ${view.color("PROPOSITION LOCKED", "cyan")} [${latencyMs}ms] ${view.color(`[${kind ?? "PROP"}]`, "yellow")}\n`);
        } else if (event === "pass") {
          process.stdout.write(`\r\u001b[2K  ${view.color("●", "gray")} [${addr}] [${letter}] ${(agent?.label ?? letter).padEnd(12)} >> ${view.color("SILENT / NO CONFLICT", "gray")} [${latencyMs}ms]\n`);
        } else if (event === "error") {
          process.stdout.write(`\r\u001b[2K  ${view.color("✖", "red")} [${addr}] [${letter}] ${(agent?.label ?? letter).padEnd(12)} >> ${view.color("LINK FAILURE", "red")} [${latencyMs}ms]\n`);
        }
      },
      speak: async (agentIndex, message, kind) => {
        const agent = config.agents[agentIndex];
        const letter = String.fromCharCode(65 + agentIndex);
        const sender = agent ? `[${letter}] ${agent.label}` : `MODEL ${letter}`;
        await renderCard(view, sender, message, kind, agentColor(agentIndex), options.animation);
      },
      error: async (agentIndex, message) => {
        const agent = config.agents[agentIndex];
        const letter = String.fromCharCode(65 + agentIndex);
        const sender = agent ? `[${letter}] ${agent.label}` : `MODEL ${letter}`;
        await renderCard(view, sender, message, "LINK ERROR", "red", false);
      },
      metric: (saved, routed) => updateTopMetric(view, saved, routed)
    });
    sidecar.stop();
    const efficiency = result.savedTokens ? Math.round(result.savedTokens / (result.savedTokens + result.routedTokens) * 100) : 0;
    const status = result.resolved ? "CONSENSUS VERDICT" : result.verdictProduced ? "VERDICT PRODUCED" : "DISCUSSION INCOMPLETE";
    await renderCard(view, "SYSTEM", `${status}  │  ${result.responsiveModels}/${config.agents.length} MODELS RESPONSIVE  │  ${result.turns} SPOKEN TURNS  │  ${Date.now() - startedAt}ms\nSAVED ${efficiency}%  │  CONTEXT REDUCTION ~${efficiency}%*  │  ROUTED ~${result.routedTokens}\n*Estimate from context trimming; not a benchmark claim.`, "FINAL", "cyan", false);
    process.exit(0);
  } finally {
    sidecar.stop();
  }
}

const NODE_ADDRS = ["0x4A7F", "0x9B12", "0xC3E4", "0x5D8A", "0xF110"];

function renderBanner(view: TerminalView, agents: Array<{ label: string; model: string }>): void {
  const width = Math.min(Math.max(process.stdout.columns || 78, 72), 100);
  const inner = width - 2;
  const row = (value: string) => `│${value.slice(0, inner).padEnd(inner)}│\n`;

  const logo = [
    "  ██████╗ ██╗      █████╗  ██████╗██╗  ██╗██╗    ██╗██╗██████╗ ███████╗",
    "  ██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝██║    ██║██║██╔══██╗██╔════╝",
    "  ██████╔╝██║     ███████║██║     █████╔╝ ██║ █╗ ██║██║██████╔╝█████╗  ",
    "  ██╔══██╗██║     ██╔══██║██║     ██╔═██╗ ██║███╗██║██║██╔══██╗██╔══╝  ",
    "  ██████╔╝███████╗██║  ██║╚██████╗██║  ██╗╚███╔███╔╝██║██║  ██║███████╗"
  ];

  process.stdout.write("\n");
  for (const line of logo) {
    if (view.options.plain) {
      process.stdout.write(line + "\n");
    } else {
      // Red & Black styling: glowing crimson blocks with dark shadow accents
      const styledLine = line
        .replace(/██/g, "\u001b[1;91m██\u001b[0m")
        .replace(/[╔═╗╚╝║█]/g, match => `\u001b[31m${match}\u001b[0m`)
        .replace(/[\s]+/g, match => `\u001b[90m${match}\u001b[0m`);
      process.stdout.write(styledLine + "\n");
    }
  }
  process.stdout.write(view.color("  [ QUANTUM AI DELIBERATION PROTOCOL // SEC-LEVEL: 0x05 // CIPHER: AES-256 ]\n\n", "red"));

  process.stdout.write(view.color(`┌─ ◈ NEURAL BACKCHANNEL TELEMETRY [TOPOLOGY: 5-NODE FULL MESH] ◈ ${"─".repeat(Math.max(0, inner - 62))}┐\n`, "red"));
  process.stdout.write(view.color(row(splitRow("  [SYS] DENSE SYMBOLIC DSL STREAMING", "EFFICIENCY +80%", inner)), "bold"));
  process.stdout.write(view.color(row(splitRow("  [NET] ENCRYPTED CROSS-EXAMINATION MATRIX", "LATENCY < 2.5s", inner)), "gray"));
  process.stdout.write(view.color(`├${"─".repeat(inner)}┤\n`, "red"));
  agents.forEach((agent, index) => {
    const colors = ["red", "yellow", "magenta", "green", "cyan"] as const;
    const letter = String.fromCharCode(65 + index);
    const addr = NODE_ADDRS[index] ?? "0x0000";
    process.stdout.write(view.color(row(`  [NODE 0x0${index + 1}] ⚡ [${letter}] ${agent.label.padEnd(12)} │ ${addr} │ ${agent.model.padEnd(28)} │ LINKED`), colors[index]!));
  });
  process.stdout.write(view.color(`└${"─".repeat(inner)}┘\n\n`, "red"));
}

function updateTopMetric(view: TerminalView, saved: number, routed: number): void {
  if (!process.stdout.isTTY || view.options.plain) return;
  const width = Math.min(Math.max(process.stdout.columns || 78, 72), 100);
  const efficiency = saved ? Math.round(saved / (saved + routed) * 100) : 0;
  const fieldWidth = Math.min(31, width - 38);
  const savedMetric = `SAVED ${efficiency}%`.padStart(fieldWidth);
  const reductionMetric = `CONTEXT REDUCTION ~${efficiency}%*`.slice(-fieldWidth).padStart(fieldWidth);
  const column = width - fieldWidth;
  process.stdout.write(`\u001b[s\u001b[2;${column}H${view.color(savedMetric, "yellow")}\u001b[3;${column}H${view.color(reductionMetric, "yellow")}\u001b[u`);
}

function splitRow(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${" ".repeat(gap)}${right}`;
}

function spinner(view: TerminalView, text: string, enabled: boolean): () => void {
  if (!enabled || !process.stdout.isTTY) { view.line("SYSTEM", text, "CALLING"); return () => undefined; }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]; let frame = 0;
  const draw = () => process.stdout.write(`\r\u001b[2K${view.color(frames[frame++ % frames.length]!, "green")} ${view.color("⚡ [0x3F8A]", "yellow")} ${text} ${view.color("[EXECUTING HEURISTICS]", "gray")}`);
  draw(); const timer = setInterval(draw, 80);
  return () => { clearInterval(timer); process.stdout.write("\r\u001b[2K"); };
}

async function renderCard(view: TerminalView, sender: string, raw: string, type: string, accent: "cyan" | "blue" | "magenta" | "green" | "yellow" | "red" | "gray", animated: boolean): Promise<void> {
  const content = sanitizeTerminal(raw);
  if (view.options.plain) { view.line(sender, content, type); return; }
  const width = type === "VERDICT"
    ? Math.min(Math.max(process.stdout.columns || 78, 60), 100)
    : Math.min(Math.max(process.stdout.columns || 78, 60), 80);
  const bodyWidth = width - 4;
  const time = new Date().toLocaleTimeString([], { hour12: false });

  if (type === "VERDICT") {
    process.stdout.write("\n" + view.color(`╔═ ◈ [SYNTHESIS COMPLETE] // DECOMPRESSING NEURAL VERDICT INTO MARKDOWN ◈ ${"═".repeat(Math.max(0, width - 75))}╗\n`, "green"));
    process.stdout.write(view.color(`║ [STATUS] ENCRYPTED MULTI-AGENT CONSENSUS REACHED // FINAL RESOLUTION       ║\n`, "gray"));
    process.stdout.write(view.color(`╚${"═".repeat(width - 2)}╝\n`, "green"));
  }

  const tag = `┌──[${sender}]──[SUBROUTINE: ${type}]──[TIME: ${time}]──`;
  process.stdout.write(view.color(`${tag}${"─".repeat(Math.max(0, width - tag.length - 1))}┐\n`, accent));

  const highlighted = formatDslPayload(content, view);
  for (const line of wrapText(highlighted, bodyWidth)) {
    process.stdout.write(view.color("│ ", accent));
    if (animated && process.stdout.isTTY) for (const character of line) { process.stdout.write(character); await delay(1); }
    else process.stdout.write(line);
    process.stdout.write(`${" ".repeat(Math.max(0, bodyWidth - stripAnsi(line).length))}${view.color(" │", accent)}\n`);
  }
  process.stdout.write(view.color(`└──${"─".repeat(width - 4)}┘\n`, accent));
}

function formatDslPayload(text: string, view: TerminalView): string {
  if (!view.options.color) return text;
  return text
    .replace(/\bPROP:/g, view.color("💡 [PROP]", "cyan") + " ")
    .replace(/\bDISP:/g, view.color("⚔️ [DISPUTE]", "red") + " ")
    .replace(/\bFLAW:/g, view.color("⚠️ [FLAW]", "yellow") + " ")
    .replace(/\bFIX:/g, view.color("🛠️ [FIX]", "green") + " ")
    .replace(/\bPREM:/g, view.color("📐 [PREMISE]", "blue") + " ")
    .replace(/\bCONC:/g, view.color("🎯 [CONCL]", "magenta") + " ")
    .replace(/\bEVID:/g, view.color("📊 [EVIDENCE]", "cyan") + " ")
    .replace(/\bRISK:/g, view.color("⚡ [RISK]", "yellow") + " ")
    .replace(/\bSYNTH:/g, view.color("🤝 [SYNTHESIS]", "green") + " ")
    .replace(/\bDELTA:/g, view.color("🔄 [DELTA]", "blue") + " ")
    .replace(/\bCONF:/g, view.color("📈 [CONF]", "magenta") + " ");
}

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

function agentColor(index: number): "cyan" | "blue" | "magenta" | "green" | "yellow" | "gray" {
  const colors = ["cyan", "blue", "magenta", "green", "yellow"] as const;
  return colors[index] ?? "gray";
}

function wrapText(content: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of content.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if (word.length > width) {
        if (current) { lines.push(current); current = ""; }
        for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
      } else if (!current) current = word;
      else if (current.length + word.length + 1 <= width) current += ` ${word}`;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

async function promptForTask(): Promise<string> {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("Task for Models A–E (paste prompt, press Enter twice to submit):\n> ");
  const lines: string[] = [];
  let timer: NodeJS.Timeout | undefined;

  return new Promise<string>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      input.close();
      resolve(lines.join("\n").trim());
    };

    input.on("line", (line) => {
      // If user presses Enter on an empty line after typing content, finish
      if (!line.trim() && lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
        finish();
        return;
      }
      lines.push(line);
      // Debounce auto-finish if a multi-line paste just completed
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (lines.some(l => l.trim())) {
          // If we received text, check if it looks like a complete paste or single line
          if (lines.length === 1 && lines[0]!.trim()) {
            finish();
          }
        }
      }, 400);
    });

    input.on("close", finish);
  });
}
