import { describe, expect, it } from "vitest";
import { identify } from "../src/discovery/process-discovery.js";

describe("CLI process identification", () => {
  it("matches the launched executable", () => {
    expect(identify("claude")).toBe("claude");
    expect(identify("C:\\Users\\dev\\AppData\\npm\\gemini.cmd --model pro")).toBe("gemini");
    expect(identify("/usr/local/bin/codex review")).toBe("codex");
    expect(identify('"C:\\Program Files\\nodejs\\claude.exe" --resume')).toBe("claude");
  });

  it("matches a script argument named after a supported CLI", () => {
    expect(identify("node /opt/tools/gemini.js --headless")).toBe("gemini");
    expect(identify("node C:\\tools\\codex.mjs")).toBe("codex");
  });

  it("does not match the bare name appearing elsewhere in the command line", () => {
    expect(identify("code D:\\Projects\\claude notes")).toBeUndefined();
    expect(identify("node build.js --config claude")).toBeUndefined();
    expect(identify("git commit -m codex")).toBeUndefined();
    expect(identify("node /opt/claude-code/cli.js")).toBeUndefined();
  });
});
