import type { DisplayOptions } from "./terminal.js";

export type StartMode = "cli" | "api";

export async function selectStartMode(options: DisplayOptions): Promise<StartMode | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "cli";
  return new Promise(resolve => {
    let cursor = 0;
    const choices: Array<{ mode: StartMode; title: string; detail: string }> = [
      { mode: "cli", title: "SCAN CLI", detail: "Connect independent Gemini, Claude, or Codex terminal sessions" },
      { mode: "api", title: "BRING API", detail: "Run the live model room with your own API providers" }
    ];
    const redraw = () => render(choices, cursor, options);
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onKey);
      process.stdout.write("\u001b[?25h\n");
    };
    const finish = (mode?: StartMode) => { cleanup(); resolve(mode); };
    const onKey = (data: Buffer) => {
      const key = data.toString();
      if (key === "\u0003" || key === "\u001b" || key.toLowerCase() === "q") { finish(); return; }
      if (key === "\u001b[A" || key === "k") cursor = (cursor - 1 + choices.length) % choices.length;
      else if (key === "\u001b[B" || key === "j") cursor = (cursor + 1) % choices.length;
      else if (key === "1" || key.toLowerCase() === "c") { finish("cli"); return; }
      else if (key === "2" || key.toLowerCase() === "a") { finish("api"); return; }
      else if (key === "\r") { finish(choices[cursor]!.mode); return; }
      redraw();
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onKey);
    process.stdout.write("\u001b[?25l");
    redraw();
  });
}

function render(choices: Array<{ title: string; detail: string }>, cursor: number, options: DisplayOptions): void {
  const cyan = (value: string) => options.color ? `\u001b[96m${value}\u001b[0m` : value;
  const green = (value: string) => options.color ? `\u001b[92m${value}\u001b[0m` : value;
  const gray = (value: string) => options.color ? `\u001b[90m${value}\u001b[0m` : value;
  process.stdout.write("\u001b[2J\u001b[H");
  process.stdout.write(`${cyan("BLACKWIRE // OPEN A CHANNEL")}\n${gray("Independent contexts. Shared intelligence.")}\n\n`);
  choices.forEach((choice, index) => {
    const active = index === cursor;
    const pointer = active ? cyan("❯") : " ";
    const title = active ? green(choice.title) : choice.title;
    process.stdout.write(`${pointer}  [${index + 1}] ${title}\n     ${gray(choice.detail)}\n\n`);
  });
  process.stdout.write(gray("↑↓ Select   Enter Open   1 CLI   2 API   Esc Exit\n"));
}
