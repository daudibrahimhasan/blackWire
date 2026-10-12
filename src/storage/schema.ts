export const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, max_turns INTEGER NOT NULL, token_budget INTEGER NOT NULL, status TEXT NOT NULL, animation_enabled INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, cli_type TEXT NOT NULL, status TEXT NOT NULL, process_id INTEGER, current_room TEXT REFERENCES rooms(id), color TEXT NOT NULL, animation_state INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), sender_id TEXT NOT NULL, recipient TEXT NOT NULL, message_type TEXT NOT NULL, content TEXT NOT NULL, artifact_reference TEXT, token_estimate INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), title TEXT NOT NULL, description TEXT NOT NULL, requester TEXT NOT NULL, owner TEXT, status TEXT NOT NULL, allowed_files TEXT NOT NULL DEFAULT '[]', result_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, type TEXT NOT NULL, path TEXT NOT NULL, hash TEXT NOT NULL, summary TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS session_events (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id), event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_agent_created ON session_events(agent_id, created_at);
`;
