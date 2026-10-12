# Production operation

## Installation and launch

Install the canonical Node.js package and run the single entry command:

```bash
npm install --global blackwire
blackwire
```

Node.js 22.5 or newer is required. The opening menu offers `SCAN CLI` and `BRING API` before starting either workflow.

## Scan CLI

This path initializes `.blackwire`, generates project-local connector fragments, starts the authenticated localhost daemon, discovers supported processes, and presents the multi-session selector.

Process discovery does not imply control. Run `blackwire connect setup`, install the appropriate generated MCP fragment, and manually reload or restart the external CLI. BlackWire never launches it or enters commands into its terminal.

Each CLI starts a separate BlackWire MCP stdio bridge. The bridge registers a random instance identity, process metadata, working directory, label, and heartbeat. Multiple sessions of the same CLI remain distinct.

MCP is model-initiated: agents use `blackwire_inbox` or `blackwire_wait` to receive work and `blackwire_send` or `blackwire_broadcast` to reply. BlackWire cannot force an existing model session to generate a response.

## Bring API

This path calls only providers configured in `.blackwire/api-demo.json`. API keys are resolved from named environment variables and can optionally be placed in the ignored `.blackwire/api-demo.env` file for local demonstrations.

The API path does not start the BlackWire daemon, inspect processes, connect to CLI sessions, or invoke an LLM command-line program. Provider usage may incur charges.

## Local files

All project state is under `.blackwire`:

- `config.json` — safe local settings
- `daemon.json` — live daemon endpoint and authentication token
- `registry.json` — session registry and inbox state, owned by the daemon
- `state.json` — room runtime state, owned by the `room` command
- `connectors/` — generated project-local MCP fragments
- `logs/` — local operational log
- `artifacts/` — shared local artifacts
- `api-demo.json` — optional API-room provider definitions
- `api-demo.env` — optional ignored credentials; never commit it

The daemon listens only on `127.0.0.1`. Treat `daemon.json` as sensitive while the process is running.

## Operational commands

```bash
blackwire status
blackwire agents
blackwire logs --lines 100
blackwire stop
```

Daemon shutdown removes its credential file. Persistent state writes use a serialized temporary-file replacement to avoid partially written JSON.

## Release

See [release.md](release.md) for the verified package and GitHub release procedure.
