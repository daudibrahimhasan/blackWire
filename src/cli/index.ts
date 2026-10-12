#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { runApiDemo } from "../api-demo/runner.js";
import { runMockSession } from "../adapters/mock/run-mock-session.js";
import { generateConnectorConfigs } from "../connectors/setup.js";
import { DaemonClient } from "../daemon/client.js";
import { readDaemonInfo } from "../daemon/daemon-info.js";
import { daemonRunning, startDaemon, stopDaemon } from "../daemon/lifecycle.js";
import { DaemonServer } from "../daemon/server.js";
import { discoverCliProcesses } from "../discovery/process-discovery.js";
import { runDemo } from "../tui/demo.js";
import { runMergedRoom } from "../tui/merged-room.js";
import { runRoom } from "../tui/room.js";
import { selectSessions } from "../tui/session-selector.js";
import { selectStartMode } from "../tui/start-menu.js";
import { runtimePaths } from "../utils/runtime-paths.js";
import { ensureRuntime, loadConfig } from "../utils/runtime-state.js";
import { VERSION } from "../version.js";

const program = new Command();
program.name("blackwire").description("A live terminal backchannel for independent AI coding agents.").version(VERSION);
program.option("--demo", "run the five-model API-only demo").option("--task <text>", "API demo task").option("-f, --file <path>", "read API demo task from a text file").option("--sessions <ids>", "comma-separated labels or session IDs").option("--no-animation").option("--no-color").option("--force-color", "force ANSI colors even when NO_COLOR is set").option("--plain").action(async options => {
  const display = displayOptions(options);
  let task = options.task;
  if (options.file) {
    task = await readFile(String(options.file), "utf8");
  }
  if (options.demo) {
    await runApiDemo(display, task);
    process.exit(0);
  }
  if (options.sessions) { await startFlow(options.sessions, options); return; }
  const mode = await selectStartMode(display);
  if (mode === "api") await runApiDemo(display, task);
  else if (mode === "cli") await startFlow(undefined, options);
});

program.command("init").description("Initialize BlackWire and generate connector configuration").action(async () => {
  await ensureRuntime(); const generated = await generateConnectorConfigs();
  console.log(`BlackWire initialized. Connector files: ${generated.directory}`);
});

const daemon = program.command("daemon").description("Manage the localhost daemon");
daemon.command("start").action(async () => { await ensureRuntime(); await startDaemon(); console.log("BlackWire daemon started on localhost."); });
daemon.command("serve").option("--root <path>").action(async options => {
  const root = String(options.root ?? process.env.BLACKWIRE_ROOT ?? process.cwd());
  const config = await loadConfig(root); const server = new DaemonServer(config.port, root); await server.start();
  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
});
daemon.command("stop").action(async () => console.log(await stopDaemon() ? "BlackWire daemon stopped." : "BlackWire daemon is not running."));
daemon.command("status").action(async () => {
  const info = await readDaemonInfo(); console.log(await daemonRunning() && info ? `BlackWire daemon live: pid ${info.pid}, ${info.host}:${info.port}` : "BlackWire daemon offline.");
});

const connect = program.command("connect").description("Configure supported CLI connectors");
connect.command("setup").argument("[cli]", "gemini, claude, codex, or all", "all").action(async cli => {
  if (!new Set(["gemini", "claude", "codex", "all"]).has(String(cli))) throw new Error(`Unsupported connector ${cli}`);
  const generated = await generateConnectorConfigs();
  console.log(`Connector configuration generated in ${generated.directory}`);
  generated.files.filter(file => cli === "all" || file.includes(String(cli))).forEach(file => console.log(`  ${file}`));
  console.log("Reload the connector inside already-open sessions. BlackWire will not inject commands or launch an AI CLI.");
});

program.command("sessions").description("List connected and detected sessions").action(listSessions);
program.command("agents").description("List connected and detected sessions").action(listSessions);
program.command("status").description("Show daemon and session status").action(async () => {
  const info = await readDaemonInfo();
  if (!await daemonRunning() || !info) { console.log("BlackWire daemon offline."); return; }
  const client = new DaemonClient(); await client.connect();
  try {
    const sessions = await client.listSessions();
    console.log(`BlackWire daemon live: pid ${info.pid}, ${info.host}:${info.port}`);
    console.log(`${sessions.filter(session => session.connected).length} connected session(s).`);
  } finally { client.close(); }
});
program.command("logs").option("-n, --lines <count>", "number of lines", "50").description("Show recent local BlackWire logs").action(async options => {
  const count = Math.min(Math.max(Number.parseInt(String(options.lines), 10) || 50, 1), 1000);
  try {
    const lines = (await readFile(runtimePaths().log, "utf8")).trimEnd().split(/\r?\n/);
    console.log(lines.slice(-count).join("\n"));
  } catch { console.log("No BlackWire logs yet."); }
});
program.command("stop").description("Stop the local BlackWire daemon").action(async () => console.log(await stopDaemon() ? "BlackWire daemon stopped." : "BlackWire daemon is not running."));
program.command("run").requiredOption("--name <name>", "session label").requiredOption("--cli <type>", "mock, gemini, claude, or codex").description("Run a mock session or show safe connector guidance").action(async options => {
  const cli = String(options.cli).toLowerCase();
  if (cli === "mock") { await ensureRuntime(); await startDaemon(); await runMockSession(String(options.name)); return; }
  if (!new Set(["gemini", "claude", "codex"]).has(cli)) throw new Error(`Unsupported CLI type ${cli}`);
  const generated = await generateConnectorConfigs();
  console.log(`BlackWire will not launch ${cli} automatically.`);
  console.log(`Start it manually and install the generated connector from ${generated.directory}.`);
});
program.command("demo").option("--no-animation").option("--no-color").option("--plain").description("Run the offline mock demonstration").action(async options => runDemo(displayOptions(options)));
program.command("room").option("--name <name>", "room name", "default").option("--no-animation").option("--no-color").option("--plain").description("Open the legacy two-agent mock room").action(async options => runRoom(options.name, await loadConfig(), displayOptions(options)));

async function startFlow(requested: string | undefined, options: { color?: boolean; animation?: boolean; plain?: boolean }): Promise<void> {
  await ensureRuntime(); await generateConnectorConfigs(); await startDaemon();
  const client = new DaemonClient(); await client.connect();
  try {
    const sessions = await client.listSessions(); const detected = await discoverCliProcesses(sessions);
    const connected = sessions.filter(x => x.connected);
    const chosen = requested
      ? connected.filter(x => requested.split(",").map(v => v.trim().toLowerCase()).includes(x.id.toLowerCase()) || requested.split(",").map(v => v.trim().toLowerCase()).includes(x.label.toLowerCase()))
      : (await selectSessions(sessions, detected)).selected;
    if (!chosen.length) {
      console.log("\nNo connected sessions selected. Run 'blackwire connect setup' and reload the connector inside an open CLI."); return;
    }
    await runMergedRoom(client, chosen, displayOptions(options));
  } finally { client.close(); }
}
async function listSessions(): Promise<void> {
  await startDaemon(); const client = new DaemonClient(); await client.connect();
  try {
    const sessions = await client.listSessions(); const detected = await discoverCliProcesses(sessions);
    console.log("CONNECTED"); sessions.filter(session => session.connected).forEach(session => console.log(`${session.id}  ${session.cliType}  ${session.label}  ${session.cwd}`));
    console.log("\nDETECTED — CONNECTION REQUIRED"); detected.filter(item => !item.connectedSessionId).forEach(item => console.log(`${item.cliType}  PID ${item.pid}  ${item.cwd ?? "directory unavailable"}`));
  } finally { client.close(); }
}
function displayOptions(options: { color?: boolean; animation?: boolean; plain?: boolean; forceColor?: boolean }) {
  const plain = Boolean(options.plain);
  return { plain, color: !plain && options.color !== false && (Boolean(options.forceColor) || !process.env.NO_COLOR), animation: !plain && options.animation !== false };
}

program.parseAsync(process.argv).catch(error => { process.stderr.write(`BlackWire error: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
