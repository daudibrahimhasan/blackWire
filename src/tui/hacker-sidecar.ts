import type { DisplayOptions } from "./terminal.js";

const SAVE_CURSOR = "\u001b7";
const RESTORE_CURSOR = "\u001b8";
const DIM_GREEN = "\u001b[2;32m";
const GREEN = "\u001b[92m";
const RESET = "\u001b[0m";
const GLYPHS = "0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ010101";

interface Stream {
  column: number;
  row: number;
  length: number;
  speed: number;
  phase: number;
}

export interface HackerSidecar {
  stop(): void;
}

/** Classic green code rain in the unused area to the right of the demo. */
export function startHackerSidecar(options: DisplayOptions, mainWidth = 80): HackerSidecar {
  const terminalWidth = process.stdout.columns || 0;
  const terminalHeight = process.stdout.rows || 0;
  const enabled = Boolean(
    process.stdout.isTTY && options.animation && options.color && !options.plain &&
    terminalWidth >= mainWidth + 14 && terminalHeight >= 12
  );
  if (!enabled) return { stop: () => undefined };

  const streams: Stream[] = [];
  const minimumTrail = Math.max(6, Math.floor(terminalHeight * 0.45));
  const maximumTrail = Math.max(minimumTrail, Math.floor(terminalHeight * 0.85));
  for (let column = mainWidth + 2; column <= terminalWidth - 1; column += 1) {
    streams.push({
      column,
      row: randomInt(1, terminalHeight),
      length: randomInt(minimumTrail, maximumTrail),
      speed: randomInt(1, 2),
      phase: randomInt(0, 1)
    });
  }

  let tick = 0;
  const draw = () => {
    tick += 1;
    let output = SAVE_CURSOR;
    for (const stream of streams) {
      if ((tick + stream.phase) % stream.speed !== 0) continue;
      const previous = wrapRow(stream.row - 1, terminalHeight);
      const tail = wrapRow(stream.row - stream.length, terminalHeight);
      output += `\u001b[${tail};${stream.column}H `;
      output += `\u001b[${previous};${stream.column}H${DIM_GREEN}${glyph()}${RESET}`;
      output += `\u001b[${stream.row};${stream.column}H${GREEN}${glyph()}${RESET}`;
      stream.row = wrapRow(stream.row + 1, terminalHeight);
      if (Math.random() < 0.04) stream.length = randomInt(minimumTrail, maximumTrail);
    }
    process.stdout.write(output + RESTORE_CURSOR);
  };

  draw();
  const timer = setInterval(draw, 7);
  timer.unref();
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stdout.write(RESET);
    }
  };
}

function glyph(): string {
  return GLYPHS[randomInt(0, GLYPHS.length - 1)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wrapRow(row: number, height: number): number {
  return ((row - 1 + height) % height) + 1;
}
