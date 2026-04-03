import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StoreShape } from "../types.js";
import { EMPTY_STORE, type StoreBackend } from "./store.js";

export class JsonStore implements StoreBackend {
  constructor(private readonly path: string) {}

  async read(): Promise<StoreShape> {
    if (!existsSync(this.path)) return EMPTY_STORE;
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      contents: parsed.contents ?? {},
      verifications: parsed.verifications ?? {},
      attestations: parsed.attestations ?? {},
      idempotency: parsed.idempotency ?? {},
    };
  }

  async write(next: StoreShape): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(next, null, 2), "utf8");
  }
}
