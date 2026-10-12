import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimePaths } from "../utils/runtime-paths.js";

export interface ConnectorFiles { directory: string; files: string[]; }

export async function generateConnectorConfigs(cwd = process.cwd()): Promise<ConnectorFiles> {
  const directory = resolve(runtimePaths(cwd).root, "connectors");
  await mkdir(directory, { recursive: true });
  const bridge = process.env.BLACKWIRE_MCP_ENTRY
    ? resolve(process.env.BLACKWIRE_MCP_ENTRY)
    : resolve(dirname(fileURLToPath(import.meta.url)), "..", "mcp", "server.js");
  const base = (cliType: string) => ({ command: process.execPath, args: [bridge], env: { BLACKWIRE_ROOT: cwd, BLACKWIRE_CLI_TYPE: cliType } });
  const files = [
    resolve(directory, "gemini.settings.fragment.json"),
    resolve(directory, "claude.mcp.json"),
    resolve(directory, "codex.config.toml")
  ];
  await writeFile(files[0]!, JSON.stringify({ mcpServers: { blackwire: base("gemini") } }, null, 2) + "\n", "utf8");
  await writeFile(files[1]!, JSON.stringify({ mcpServers: { blackwire: { type: "stdio", ...base("claude") } } }, null, 2) + "\n", "utf8");
  await writeFile(files[2]!, `[mcp_servers.blackwire]\ncommand = ${toml(process.execPath)}\nargs = [${toml(bridge)}]\nenv = { BLACKWIRE_ROOT = ${toml(cwd)}, BLACKWIRE_CLI_TYPE = "codex" }\n`, "utf8");
  return { directory, files };
}
function toml(value: string): string { return JSON.stringify(value); }
