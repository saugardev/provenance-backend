import type { AppConfig } from "../config.js";
import type { StoreBackend } from "./store.js";
import { JsonStore } from "./jsonStore.js";
import { PostgresStore } from "./postgresStore.js";

export function createStore(cfg: AppConfig): StoreBackend {
  if (cfg.storageMode === "postgres") {
    if (!cfg.databaseUrl) {
      throw new Error("DATABASE_URL is required when STORAGE_MODE=postgres");
    }
    return new PostgresStore(cfg.databaseUrl);
  }
  return new JsonStore(cfg.dataFile);
}
