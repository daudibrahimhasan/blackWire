const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const SECRET_PATTERN = /\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]+)/gi;

export function sanitizeTerminal(value: string): string {
  return value.replace(ANSI_PATTERN, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function redactSecrets(value: string): string {
  return value.replace(SECRET_PATTERN, "$1=[REDACTED]");
}
