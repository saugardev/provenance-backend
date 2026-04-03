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
  const backendApiKey = "test_backend_key";
  const mcpApiKey = "test_mcp_key";
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
      DATA_FILE: `data/test-store-${apiPort}.json`,
      BACKEND_API_KEY: backendApiKey,
      MCP_API_KEY: mcpApiKey,
      INGEST_RATE_LIMIT_PER_MINUTE: "5",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  api.stderr.on("data", (d) => process.stderr.write(`[api:err] ${d}`));

  const base = `http://127.0.0.1:${apiPort}`;

  try {
    await wait(`${base}/healthz`);

    const unauthorized = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content_id: "photo-unauth",
        content_hash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        idkit_response: {
          action: "upload_photo",
          signal: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          responses: [
            {
              identifier: "orb",
              proof: "0xproof",
              merkle_root: "0xroot",
              nullifier: "0xnullifier-unauth",
            },
          ],
        },
      }),
    });
    assert(unauthorized.status === 401, `unauthorized status ${unauthorized.status}`);
    const unauthorizedJson = await unauthorized.json();
    assert(unauthorizedJson?.api_version === "v1", "unauthorized response has api_version");
    assert(unauthorizedJson?.error?.code === "UNAUTHORIZED", "unauthorized error code");

    const ingestPayload = {
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
    };

    const ingest = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey, "idempotency-key": "idem-photo-001" },
      body: JSON.stringify(ingestPayload),
    });

    const ingestJson = await ingest.json();
    assert(ingest.status === 200, `ingest status ${ingest.status}`);
    assert(ingestJson?.ok === true, "ingest ok");
    assert(ingestJson?.api_version === "v1", "ingest api_version");
    assert(ingestJson?.data?.content?.content_id === "photo-001", "ingest data envelope");
    assert(ingestJson?.attestation?.public_values_commitment_hash_hex, "attestation commitment hash exists");
    assert(ingestJson?.verification?.decision === "accepted", "verification accepted");
    assert(typeof ingestJson?.verification?.request_hash_hex === "string", "request hash exists");
    assert(typeof ingestJson?.verification?.response_hash_hex === "string", "response hash exists");
    const verifyHitCountAfterFirstIngest = verifyHits.length;

    const replay = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey, "idempotency-key": "idem-photo-001" },
      body: JSON.stringify(ingestPayload),
    });
    const replayJson = await replay.json();
    assert(replay.status === 200, `replay status ${replay.status}`);
    assert(replay.headers.get("idempotent-replay") === "true", "replay header expected");
    assert(replayJson?.attestation?.attestation_id === ingestJson?.attestation?.attestation_id, "replay should return same body");
    assert(verifyHits.length === verifyHitCountAfterFirstIngest, "replay should not hit world verify endpoint again");

    const idemConflict = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey, "idempotency-key": "idem-photo-001" },
      body: JSON.stringify({
        ...ingestPayload,
        content_id: "photo-001b",
      }),
    });
    assert(idemConflict.status === 409, `idempotency conflict should fail, got ${idemConflict.status}`);
    const idemConflictJson = await idemConflict.json();
    assert(idemConflictJson?.error?.code === "IDEMPOTENCY_CONFLICT", "idempotency conflict code");

    const content = await fetch(`${base}/v1/content/photo-001`).then((r) => r.json());
    assert(content?.ok === true, "content read ok");
    assert(content?.api_version === "v1", "content api_version");
    assert(content?.data?.content_id === "photo-001", "content data envelope");

    const prov = await fetch(`${base}/v1/content/photo-001/provenance`).then((r) => r.json());
    assert(prov?.ok === true, "provenance read ok");
    assert(prov?.api_version === "v1", "provenance api_version");
    assert(Array.isArray(prov?.data?.nodes), "provenance data envelope");

    const missingContent = await fetch(`${base}/v1/content/not-found`);
    assert(missingContent.status === 404, `missing content should be 404, got ${missingContent.status}`);
    const missingContentJson = await missingContent.json();
    assert(missingContentJson?.error?.code === "NOT_FOUND", "missing content error code");

    const attId = ingestJson?.attestation?.attestation_id;
    const attMinimal = await fetch(`${base}/v1/attestation/${attId}`).then((r) => r.json());
    assert(attMinimal?.ok === true, "minimal attestation read ok");
    assert(attMinimal?.mode === "minimal", "default mode is minimal");
    assert(!attMinimal?.attestation?.public_values_b64, "minimal mode should not expose full public values");

    const attFull = await fetch(`${base}/v1/attestation/${attId}?mode=full`).then((r) => r.json());
    assert(attFull?.ok === true, "full attestation read ok");
    assert(attFull?.mode === "full", "full mode selected");
    assert(typeof attFull?.attestation?.public_values_b64 === "string", "full mode includes public values");

    const attVerify = await fetch(`${base}/v1/attestation/${attId}/verify`).then((r) => r.json());
    assert(attVerify?.ok === true, "attestation verify endpoint ok");
    assert(attVerify?.valid === true, "attestation verification should pass in mock mode");
    assert(Array.isArray(attVerify?.checks) && attVerify.checks.length > 0, "attestation checks are returned");
    assert(
      attVerify.checks.some((c: any) => c.name === "public_values_request_hash_match" && c.ok === true),
      "request hash should be part of committed public values",
    );

    const signalMismatch = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey },
      body: JSON.stringify({
        content_id: "photo-002",
        content_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        idkit_response: {
          action: "upload_photo",
          signal: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          responses: [
            {
              identifier: "orb",
              proof: "0xproof",
              merkle_root: "0xroot",
              nullifier: "0xnullifier2",
            },
          ],
        },
      }),
    });
    assert(signalMismatch.status === 400, `signal mismatch should fail, got ${signalMismatch.status}`);
    const signalMismatchJson = await signalMismatch.json();
    assert(signalMismatchJson?.error?.code === "INVALID_INPUT", "signal mismatch INVALID_INPUT");

    const policyMismatch = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey },
      body: JSON.stringify({
        content_id: "photo-003",
        content_hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        verification_policy: "device",
        idkit_response: {
          action: "upload_photo",
          signal: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          responses: [
            {
              identifier: "orb",
              proof: "0xproof",
              merkle_root: "0xroot",
              nullifier: "0xnullifier3",
            },
          ],
        },
      }),
    });
    assert(policyMismatch.status === 400, `policy mismatch should fail, got ${policyMismatch.status}`);
    const policyMismatchJson = await policyMismatch.json();
    assert(policyMismatchJson?.error?.code === "INVALID_INPUT", "policy mismatch INVALID_INPUT");

    const mcpUnauthorized = await fetch(`${base}/mcp/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "get_content", content_id: "photo-001" }),
    });
    assert(mcpUnauthorized.status === 401, `mcp unauthorized status ${mcpUnauthorized.status}`);

    const mcpAuthorized = await fetch(`${base}/mcp/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mcp-key": mcpApiKey },
      body: JSON.stringify({ tool: "verify_attestation", attestation_id: attId }),
    }).then((r) => r.json());
    assert(mcpAuthorized?.ok === true, "mcp authorized call ok");
    assert(mcpAuthorized?.result?.valid === true, "mcp verify_attestation should be valid");

    const rateLimited = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": backendApiKey },
      body: JSON.stringify({
        content_id: "photo-004",
        content_hash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        idkit_response: {
          action: "upload_photo",
          signal: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          responses: [
            {
              identifier: "orb",
              proof: "0xproof",
              merkle_root: "0xroot",
              nullifier: "0xnullifier4",
            },
          ],
        },
      }),
    });
    assert(rateLimited.status === 429, `rate limit should fail with 429, got ${rateLimited.status}`);
    const rateLimitedJson = await rateLimited.json();
    assert(rateLimitedJson?.error?.code === "RATE_LIMITED", "rate limit error code");

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
