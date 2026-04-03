import { resolve } from "node:path";

export type AppConfig = {
  port: number;
  host: string;
  dataFile: string;
  worldVerifyBaseUrl: string;
  worldRpId: string;
  worldApiKey?: string;
  teeMode: "mock" | "rust";
  teeServiceUrl: string;
  backendApiKey?: string;
  ingestRateLimitPerMinute: number;
};

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3200);
  const host = process.env.HOST ?? "127.0.0.1";
  const dataFile = process.env.DATA_FILE
    ? resolve(process.cwd(), process.env.DATA_FILE)
    : resolve(process.cwd(), "data", "store.json");
  const worldVerifyBaseUrl = process.env.WORLD_VERIFY_BASE_URL ?? "https://developer.world.org";
  const worldRpId = process.env.WORLD_RP_ID ?? "rp_placeholder";
  const worldApiKey = process.env.WORLD_API_KEY;
  const teeMode = (process.env.TEE_MODE ?? "mock") === "rust" ? "rust" : "mock";
  const teeServiceUrl = process.env.TEE_SERVICE_URL ?? "http://127.0.0.1:3400";
  const backendApiKey = process.env.BACKEND_API_KEY;
  const ingestRateLimitPerMinute = Number(process.env.INGEST_RATE_LIMIT_PER_MINUTE ?? 60);

  return {
    port,
    host,
    dataFile,
    worldVerifyBaseUrl,
    worldRpId,
    worldApiKey,
    teeMode,
    teeServiceUrl,
    backendApiKey,
    ingestRateLimitPerMinute,
  };
}
