import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ArtifactRecord { id: string; type: string; path: string; hash: string; summary: string; createdBy: string; createdAt: string; }

export class ArtifactStore {
  constructor(private readonly root: string) {}
  async save(type: string, content: string, summary: string, createdBy: string): Promise<ArtifactRecord> {
    const safeType = type.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const id = randomUUID();
    const directory = resolve(this.root, safeType);
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${id}.txt`);
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    return { id, type: safeType, path, hash: createHash("sha256").update(content).digest("hex"), summary, createdBy, createdAt: new Date().toISOString() };
  }
}
