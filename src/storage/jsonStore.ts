import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StoreShape } from "../types.js";

const EMPTY: StoreShape = {
  contents: {},
  verifications: {},
  attestations: {},
  idempotency: {},
};

export class JsonStore {
  constructor(private readonly path: string) {}

  read(): StoreShape {
    if (!existsSync(this.path)) return EMPTY;
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      contents: parsed.contents ?? {},
      verifications: parsed.verifications ?? {},
      attestations: parsed.attestations ?? {},
      idempotency: parsed.idempotency ?? {},
    };
  }

  write(next: StoreShape): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(next, null, 2), "utf8");
  }
}
