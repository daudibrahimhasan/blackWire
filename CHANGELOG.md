# Changelog

All notable changes to BlackWire are documented here. The project follows Semantic Versioning.

## [Unreleased]

### Fixed

- The daemon registry moved to `.blackwire/registry.json`. It previously shared `state.json` with the
  room runtime state, so running `blackwire room` silently discarded sessions and queued inboxes.
  An existing `state.json` is still read once for migration.
- `blackwire_wait` no longer polls a destructive inbox read. Delivery is driven by the daemon's
  `message` event into a local buffer, so concurrent readers cannot drain messages out from under
  each other.
- `stopDaemon` verifies the daemon still answers before signalling the recorded PID, instead of
  killing whatever process has since reused that PID.
- The daemon client keeps a permanent `error` listener; a post-connect socket error no longer
  terminates the process.
- API error text and API-room cards are terminal-sanitized before display.

### Changed

- The daemon authentication token is sent in the `Authorization` header and compared in constant
  time. The query parameter is still accepted for compatibility.
- Connections carrying an `Origin` header are refused: same-origin policy does not protect
  localhost WebSockets from browser pages.
- Registry writes are debounced rather than issued on every message, including heartbeats.
- Process discovery matches the launched executable or a CLI-named script argument, and caches
  scans for three seconds. It no longer matches the bare name anywhere in a command line.

## [0.1.0] - 2026-07-26

### Added

- Authenticated localhost WebSocket daemon with persistent session registry and inboxes.
- MCP bridge and project-local connector fragments for Gemini CLI, Claude Code, and Codex.
- Multi-session discovery, selection, and merged-room interface.
- Mock adapter, offline visual demo, and optional five-model API video demo.
- Message validation, terminal sanitization, budgets, artifact storage, and SQLite schema.
- Safe daemon lifecycle cleanup and atomic state persistence.
