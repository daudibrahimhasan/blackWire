import { setTimeout as delay } from "node:timers/promises";
import { StatusAnimation } from "../animation/status-animation.js";
import { TerminalView, type DisplayOptions } from "./terminal.js";

const SCRIPT = [
  ["A", "HYPOTHESIS", "I suspect duplicate retries in upload.ts:143."],
  ["B", "EVIDENCE", "Checking the retry path and write ordering."],
  ["B", "RESULT", "Confirmed. Two writes can occur before lock acquisition."],
  ["A", "ACTION", "Propose a minimal patch. Preserve current API behavior."],
  ["B", "RESULT", "PATCH:D14 ready. Lock now precedes retry scheduling."],
  ["A", "DECISION", "Reviewed. Accept PATCH:D14."]
] as const;

export async function runDemo(options: DisplayOptions): Promise<void> {
  const view = new TerminalView(options);
  const a = new StatusAnimation(options.animation);
  const b = new StatusAnimation(options.animation);
  view.clear();
  if (options.animation) {
    process.stdout.write(`${view.color("BLACKWIRE", "bold")}\nopening local backchannel...\n`);
    await delay(180); process.stdout.write(`${view.color("A  ● linked", "cyan")}\n`);
    await delay(160); process.stdout.write(`${view.color("B  ● linked", "magenta")}\nchannel live\n\n`);
  }
  let turns = 0;
  let tokens = 0;
  view.header("default", "fast", `${a.next("thinking")} THINKING`, `${b.next("reading")} READING`, "TURNS 0/8 | TOKENS ~0/5,000");
  for (const [sender, type, content] of SCRIPT) {
    await delay(options.animation ? 430 : 0);
    turns += 1;
    tokens += Math.ceil(content.length / 4);
    view.line(sender, content, type);
  }
  await delay(options.animation ? 250 : 0);
  view.line("SYSTEM", `TASK RESOLVED | ${turns} TURNS | ~${tokens} TOKENS`, "STATUS");
}
