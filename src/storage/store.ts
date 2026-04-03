import type { StoreShape } from "../types.js";

export const EMPTY_STORE: StoreShape = {
  contents: {},
  verifications: {},
  attestations: {},
  idempotency: {},
};

export interface StoreBackend {
  read(): Promise<StoreShape>;
  write(next: StoreShape): Promise<void>;
}
