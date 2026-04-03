import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const p = typeof a === "object" && a ? a.port : 0;
      s.close(() => resolve(p));
    });
  });
}

async function wait(url: string, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  const worldPort = await freePort();
  const apiPort = await freePort();
  const verifyHits: any[] = [];

  const world = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    verifyHits.push({ url: req.url, body });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, environment: "staging", session_id: "sess_test_1" }));
  });
  await new Promise<void>((resolve) => world.listen(worldPort, "127.0.0.1", () => resolve()));

  const api = spawn("pnpm", ["dev"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(apiPort),
      WORLD_VERIFY_BASE_URL: `http://127.0.0.1:${worldPort}`,
      WORLD_RP_ID: "rp_test",
      TEE_MODE: "mock",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  api.stderr.on("data", (d) => process.stderr.write(`[api:err] ${d}`));

  const base = `http://127.0.0.1:${apiPort}`;

  try {
    await wait(`${base}/healthz`);

    const ingest = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content_id: "photo-001",
        content_hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        idkit_response: {
          action: "upload_photo",
          signal: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          responses: [
            {
              identifier: "orb",
              proof: "0xproof",
              merkle_root: "0xroot",
              nullifier: "0xnullifier",
            },
          ],
        },
      }),
    });

    const ingestJson = await ingest.json();
    assert(ingest.status === 200, `ingest status ${ingest.status}`);
    assert(ingestJson?.ok === true, "ingest ok");
    assert(ingestJson?.attestation?.public_values_commitment_hash_hex, "attestation commitment hash exists");

    const content = await fetch(`${base}/v1/content/photo-001`).then((r) => r.json());
    assert(content?.ok === true, "content read ok");

    const prov = await fetch(`${base}/v1/content/photo-001/provenance`).then((r) => r.json());
    assert(prov?.ok === true, "provenance read ok");

    assert(verifyHits.length >= 1, "world verify endpoint should be hit");

    console.log("Programmatic backend test passed.");
  } finally {
    api.kill("SIGTERM");
    await sleep(300);
    await new Promise<void>((resolve) => world.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
