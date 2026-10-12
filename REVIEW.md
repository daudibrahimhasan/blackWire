# BlackWire — Code Review

> Read-only assessment. Nothing was built, started, installed, or executed.
> Scope: ~1,900 LOC TypeScript (`src/`), 6 test files (`tests/`), Python launcher (`python/`), CI and packaging config.
> Date: 2026-07-28 · Version reviewed: `0.1.0`

---

## Status

| # | Issue | Status |
|---|---|---|
| 1 | `state.json` collision | **Fixed** — daemon owns `registry.json`, with migration |
| 2 | No git repository | **Open** — user action |
| 3 | `blackwire_wait` destructive poll | **Fixed** — event-driven, local buffer |
| 4 | Token in query string | **Fixed** — `Authorization` header + `timingSafeEqual` |
| 5 | No `Origin` rejection | **Fixed** |
| 6 | Persist on every message | **Fixed** — 250 ms debounce, flushed on stop |
| 7 | Dead code | **Partly** — `redactSecrets` now used; unused modules left in place (no VCS) |
| 8 | Loose/expensive discovery | **Fixed** — executable match + 3 s cache |
| 9 | Thin tests | **Partly** — auth, event scope, discovery, registry persistence added; MCP bridge still untested |
| — | Smaller items | **Fixed** except the "SAVED %" metric and the crammed one-line style |

Changes are unverified: the project was not built or tested per user instruction.

---

## What this project is

BlackWire is a localhost message bus that lets separately-running AI CLI sessions (Gemini / Claude / Codex) exchange short messages without merging context windows. Three surfaces sit on one daemon:

- **`src/daemon/`** — authenticated `127.0.0.1` WebSocket server, session registry, inbox queues, JSON snapshot persistence
- **`src/mcp/server.ts`** — stdio JSON-RPC MCP bridge each CLI loads as a tool server (6 tools: `send` / `broadcast` / `inbox` / `wait` / `status` / `set_status`)
- **`src/api-demo/`** — an unrelated-but-bundled 5-model "debate room" that calls OpenAI / Anthropic / Gemini APIs directly

Plus TUI rendering (`src/tui/`), Windows/POSIX process discovery, connector-fragment generation, and dual npm + PyPI distribution.

---

## Verdict

**The engineering is well above average for a 0.1.0.** The security model is genuinely designed, not bolted on:

- localhost-only bind, fresh 256-bit token per daemon start
- `maxPayload: 1MB` on the WebSocket server
- zod validation on *every* wire message
- sender-identity binding, so a registered socket cannot spoof another session
- ANSI / control-character stripping
- `mode: 0o600` on the token file
- atomic write-then-rename for state
- a deliberate refusal to auto-launch or keystroke-inject into anyone's CLI

The README is unusually honest about what does not work yet ("the model choosing to use the BlackWire tools"). Zero runtime dependencies beyond `commander` / `ws` / `zod`. CI matrix on Node 22/24/26, dependabot, `SECURITY.md`, release checklist.

**What holds it back is discipline around the edges, not the core idea.**

---

## Critical

### 1. Two subsystems write the same file with different shapes

`.blackwire/state.json` is written by `DaemonServer.writeSnapshot()` (`src/daemon/server.ts:154`) as `{sessions, inboxes}`, *and* by `saveState()` (`src/utils/runtime-state.ts:30`) as `{room, status, agents, turns, tokens}` — called from `src/tui/room.ts:92`.

Run `blackwire room` while a daemon is live and the daemon's entire registry plus all queued inboxes are silently overwritten. On restart, `restore()` (`src/daemon/server.ts:160`) swallows the shape mismatch in a bare `catch` and comes back empty.

**Fix:** give the daemon its own `registry.json`, or namespace the two under distinct top-level fields.

### 2. There is no git repository

`.github/workflows/`, `CONTRIBUTING.md`, dependabot config, and `docs/release.md` all describe a git workflow — but the project directory has no `.git`. No history, no bisect, no revert, no PR for CI to run against. Every one of those files is currently decorative.

This is the single largest risk to the project and takes two minutes to fix.

### 3. `blackwire_wait` polls a destructive read

`src/mcp/server.ts:49-53` loops `client.inbox()` every 250 ms, and `inbox` *clears* the queue server-side (`src/daemon/server.ts:93-94`). Two overlapping waiters — or a `wait` racing a `blackwire_inbox` call — permanently lose messages. There is no ack, so a CLI that crashes mid-tool-call drops everything in flight.

**Fix:** the daemon already broadcasts a `message` event to that socket (`sendMessageEvent`); the bridge should await the event rather than drain-poll. Add read-acknowledgement so drops are recoverable.

---

## Significant

### 4. Auth token travels in the WebSocket URL query string

`src/daemon/client.ts:15` builds `ws://host:port?token=...`; `src/daemon/server.ts:31` parses it back out. Query strings are the most leak-prone part of a URL (logs, error traces, anything that stringifies the request). `ws` supports a `headers` option on the client — move it to `Authorization` or `Sec-WebSocket-Protocol`.

Also `supplied !== this.token` is a non-constant-time compare; `crypto.timingSafeEqual` is free here.

### 5. No `Origin` rejection on upgrade

Binding to `127.0.0.1` does **not** stop a webpage in any browser on the machine from opening `ws://127.0.0.1:4737` — same-origin policy does not apply to WebSockets. The token still gates it, but a `verifyClient` that rejects any request carrying an `Origin` header closes the entire class for one line of code.

### 6. Full-state persist on every single message

`src/daemon/server.ts:108` calls `persist()` after every handled message — including 5-second heartbeats from every session — and each persist serializes *all* sessions plus *all* inbox contents (messages up to 20,000 chars each) then does a write + rename. Cost is O(total state) per message.

**Fix:** debounce with a trailing ~250 ms flush, or actually use the SQLite layer that already half-exists.

### 7. Dead code in a security-sensitive project

`src/storage/database.ts`, `src/storage/schema.ts`, and `src/artifacts/artifact-store.ts` are referenced by nothing. `redactSecrets` (`src/security/sanitize.ts:8`) is used only by its own test.

That last one matters: it *looks* like a guarantee the daemon makes, but messages routed through `send` are ANSI-sanitized and **not** secret-redacted. Either wire it into the send path or delete it — right now it is a promise the code does not keep.

### 8. Process discovery is both loose and expensive

`identify()` (`src/discovery/process-discovery.ts:38-43`) regexes the full lowercased command line, so `code D:\Projects\claude-notes` or `node build.js --config claude` register as a detected Claude CLI.

On Windows it spawns `powershell.exe` running `Get-CimInstance Win32_Process` over *every* process — a 5-second-timeout subprocess fired on every `sessions`, `status`, and room launch.

**Fix:** match against the executable name / argv[0] only, and cache results for a few seconds.

### 9. Test coverage does not support a public release

Six files, ~90 lines total; `tests/security.test.ts` is three one-line assertions.

Untested:

- token rejection path
- stale-session expiry
- the `sendMessageEvent` subscription allow-list (`src/daemon/server.ts:139`) — a real privacy boundary
- persist / restore round-trip
- discovery matching
- merged-room command parsing
- **the entire MCP bridge**, which is the whole product surface for real CLIs

---

## Smaller, worth doing

| Location | Issue |
|---|---|
| `src/daemon/client.ts:17-18` | `socket.once("error", reject)` only covers the connect phase. Any error after `open` hits an EventEmitter with no `error` listener and takes the process down. Add a persistent `socket.on("error", …)`. |
| `src/daemon/lifecycle.ts:23` | `stopDaemon` calls `process.kill(info.pid)` straight from a possibly-stale `daemon.json`. After PID reuse you kill an unrelated process. `clearDaemonInfo` already does the identity check — do it *before* the kill, not after. |
| `src/daemon/client.ts:34` | `heartbeat` fires without a readyState check — silently dropped, or throws, after close. |
| `src/api-demo/runner.ts:40`, `src/api-demo/discussion.ts:64` | Model *replies* are sanitized (`parseBid`, verdict), but API *error* bodies render raw via `renderCard`. `safeApiError` truncates and redacts key patterns but does not strip escape sequences. A hostile `openai-compatible` `baseUrl` can write control sequences into the user's terminal. One `sanitizeTerminal()` call fixes it. |
| `src/api-demo/discussion.ts:46` | The "SAVED %" banner reads 0% in almost every real run. `savedTokens` only accrues when the transcript exceeds `maxSharedCharacters`, but `MAX_ROUNDS = 2` with a 120-word cap means it essentially never does. A headline metric structurally pinned at zero. |
| `README.md` | `--force-color` is implemented (`src/cli/index.ts:23`) but missing from the command list. |
| throughout | One-statement-per-line-crammed style (`server.ts:117`, `server.ts:146`, `merged-room.ts:20`, `client.ts:23`) packs 3–5 statements onto a single line. That is exactly where the state bugs above are hiding, and it weakens diff/blame review. Cheapest quality win available. |

---

## Recommended order of work

1. `git init`, commit, push — everything else is unreviewable until this exists.
2. Split the `state.json` collision (#1) and add a test that catches it.
3. Replace `blackwire_wait` polling with event-driven delivery + acks (#3).
4. Move the token to a header; add `timingSafeEqual` and `Origin` rejection (#4, #5).
5. Delete the unused storage / artifact modules, or finish them — and decide whether `redactSecrets` is a real guarantee (#7).
6. Write tests for the MCP bridge and the subscription allow-list before calling anything 1.0 (#9).

---

The foundation is solid and the security instincts are right. The gap is that the supporting rigor — version control, tests, dead-code hygiene — has not caught up to the quality of the core design.
