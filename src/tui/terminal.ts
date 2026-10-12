import { sanitizeTerminal } from "../security/sanitize.js";

export interface DisplayOptions { color: boolean; animation: boolean; plain: boolean; }
const ANSI = { reset: "\u001b[0m", cyan: "\u001b[96m", blue: "\u001b[94m", magenta: "\u001b[95m", green: "\u001b[92m", yellow: "\u001b[93m", red: "\u001b[91m", gray: "\u001b[90m", bold: "\u001b[1m", clear: "\u001b[2J\u001b[H" };

export class TerminalView {
  constructor(readonly options: DisplayOptions) {}
  color(value: string, color: keyof typeof ANSI): string {
    return this.options.color && !this.options.plain ? `${ANSI[color]}${value}${ANSI.reset}` : value;
  }
  line(sender: string, content: string, type = "MESSAGE"): void {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const palette: keyof typeof ANSI = sender === "A" || sender === "MODEL A" || sender === "Architect" ? "cyan" : sender === "MODEL B" || sender === "Analyst" ? "blue" : sender === "B" || sender === "MODEL C" || sender === "Critic" ? "magenta" : sender === "MODEL D" || sender === "Builder" || sender === "YOU" ? "green" : sender === "MODEL E" || sender === "Judge" ? "yellow" : type === "ERROR" ? "red" : "gray";
    process.stdout.write(`${this.color(time, "gray")}  ${this.color(sender.padEnd(6), palette)} ${this.color(type.padEnd(12), "gray")} ${sanitizeTerminal(content)}\n`);
  }
  header(room: string, mode: string, a: string, b: string, usage: string): void {
    if (this.options.plain) { process.stdout.write(`BLACKWIRE | ROOM ${room} | MODE ${mode.toUpperCase()} | ${usage}\nA ${a} | B ${b}\n`); return; }
    process.stdout.write(`${this.color("BLACKWIRE", "bold")}  ROOM ${room}  MODE ${mode.toUpperCase()}  LINK LIVE\n`);
    process.stdout.write(`${this.color(`A ${a}`, "cyan")}    ${this.color(`B ${b}`, "magenta")}    ${this.color(usage, "gray")}\n`);
    process.stdout.write(`${this.color("─".repeat(Math.min(process.stdout.columns || 72, 100)), "gray")}\n`);
  }
  clear(): void { process.stdout.write(this.options.plain ? "\n" : ANSI.clear); }
}
