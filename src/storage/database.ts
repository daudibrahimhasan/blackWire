import { DatabaseSync } from "node:sqlite";
import { SQLITE_SCHEMA } from "./schema.js";
import type { StoredMessage } from "../protocol/types.js";

export class BlackWireDatabase {
  private readonly db: DatabaseSync;
  constructor(path: string) { this.db = new DatabaseSync(path); this.db.exec(SQLITE_SCHEMA); }
  saveMessage(message: StoredMessage): void {
    this.db.prepare(`INSERT INTO messages (id, room_id, sender_id, recipient, message_type, content, artifact_reference, token_estimate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(message.id, message.roomId, message.senderId, message.recipient, message.type, message.content, message.artifactReference ?? null, message.tokenEstimate, message.createdAt);
  }
  close(): void { this.db.close(); }
}
