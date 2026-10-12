import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

describe("release version", () => {
  it("matches package.json", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    expect(VERSION).toBe(packageJson.version);
  });
  it("matches pyproject.toml", async () => {
    const pyproject = await readFile("pyproject.toml", "utf8");
    expect(pyproject).toMatch(new RegExp(`^version = "${VERSION.replaceAll(".", "\\.")}"$`, "m"));
  });
});
