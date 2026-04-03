import { Pool } from "pg";
import type { StoreShape } from "../types.js";
import { EMPTY_STORE, type StoreBackend } from "./store.js";

export class PostgresStore implements StoreBackend {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS livy_state (
        id SMALLINT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(
      `
      INSERT INTO livy_state (id, payload)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify(EMPTY_STORE)],
    );
  }

  async read(): Promise<StoreShape> {
    await this.ready;
    const r = await this.pool.query("SELECT payload FROM livy_state WHERE id = 1");
    const payload = (r.rows[0]?.payload ?? EMPTY_STORE) as StoreShape;
    return {
      contents: payload.contents ?? {},
      verifications: payload.verifications ?? {},
      attestations: payload.attestations ?? {},
      idempotency: payload.idempotency ?? {},
    };
  }

  async write(next: StoreShape): Promise<void> {
    await this.ready;
    await this.pool.query(
      `
      UPDATE livy_state
      SET payload = $1::jsonb, updated_at = now()
      WHERE id = 1
      `,
      [JSON.stringify(next)],
    );
  }
}
