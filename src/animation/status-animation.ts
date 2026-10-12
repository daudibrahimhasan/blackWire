const ACTIVE_FRAMES = ["●", "◉", "◎", "◉"] as const;
const STATIC: Record<string, string> = { paused: "■", error: "×", offline: "○", completed: "◆", blocked: "!" };

export class StatusAnimation {
  private frame = 0;
  constructor(private readonly enabled: boolean, private readonly reducedMotion = false) {}
  next(status: string): string {
    if (STATIC[status]) return STATIC[status];
    if (!this.enabled || this.reducedMotion || !["thinking", "working", "reading"].includes(status)) return "●";
    const value = ACTIVE_FRAMES[this.frame % ACTIVE_FRAMES.length] ?? "●";
    this.frame += 1;
    return value;
  }
}
