# Phase 1 implementation boundary

## Implemented

- Strict configuration and protocol schemas
- Agent adapter contract and event normalization
- Deterministic mock adapter
- Disabled Codex and Claude adapter scaffolds
- Event-driven local message routing
- Room and agent state management
- Turn and estimated-token budgets
- SQLite schema and message persistence API
- Content-addressed artifact metadata and local file storage
- Terminal control-sequence removal and basic secret redaction
- Required top-level CLI command definitions

## Deliberately not implemented in Phase 1

- Terminal room UI and animations
- WebSocket server lifecycle and daemon process management
- CLI command handlers
- MCP server tools
- Real Codex, Claude, or other model connections
- Automated subprocess or terminal control

## Manual verification commands for a later user-run session

```bash
npm run typecheck
npm run build
npm test
```

Dependencies must already exist in a location chosen by the user. No installation command is prescribed because package-manager caches may write outside this repository. BlackWire has not run these commands. Implemented but not executed.
