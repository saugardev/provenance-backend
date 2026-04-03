import express from "express";
import { loadConfig } from "../config.js";
import { createStore } from "../storage/createStore.js";
import { MockTeeAdapter } from "../tee/mockAdapter.js";
import { HttpTeeAdapter } from "../tee/httpAdapter.js";
import { ProvenanceService } from "../services/provenanceService.js";
import { verifyWorldSignature } from "../services/worldVerifier.js";
import { verifyAttestationRecord } from "../services/attestationVerifier.js";
import type { VerificationPolicy } from "../types.js";
import { sha256ObjectHex } from "../utils/hash.js";
import { runMcpTool, type McpToolCall } from "../mcp/server.js";

const cfg = loadConfig();
const store = createStore(cfg);
const tee = cfg.teeMode === "rust" ? new HttpTeeAdapter(cfg.teeServiceUrl) : new MockTeeAdapter();
const provenance = new ProvenanceService(store, tee);

const app = express();
app.use(express.json({ limit: "1mb" }));
const ingestRateWindowMs = 60_000;
const ingestRateByIp = new Map<string, number[]>();

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    storage_mode: cfg.storageMode,
    tee_mode: cfg.teeMode,
    tee_service_url: cfg.teeServiceUrl,
    world_rp_id: cfg.worldRpId,
    ingest_auth_enabled: Boolean(cfg.backendApiKey),
    mcp_auth_enabled: Boolean(cfg.mcpApiKey),
    ingest_rate_limit_per_minute: cfg.ingestRateLimitPerMinute,
  });
});

app.post("/v1/ingest", async (req, res) => {
  try {
    if (cfg.backendApiKey) {
      const incomingApiKey = String(req.headers["x-api-key"] ?? "").trim();
      if (!incomingApiKey || incomingApiKey !== cfg.backendApiKey) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
    }

    const clientIp = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown");
    const now = Date.now();
    const recent = (ingestRateByIp.get(clientIp) ?? []).filter((x) => now - x < ingestRateWindowMs);
    if (recent.length >= cfg.ingestRateLimitPerMinute) {
      res.status(429).json({ error: "rate limit exceeded", limit_per_minute: cfg.ingestRateLimitPerMinute });
      return;
    }
    recent.push(now);
    ingestRateByIp.set(clientIp, recent);

    const input = req.body as {
      content_id?: string;
      content_hash?: string;
      idkit_response?: unknown;
      parents?: string[];
      verification_policy?: VerificationPolicy;
    };
    const request_hash_hex = sha256ObjectHex(input);
    const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
    if (idempotencyKey) {
      const snapshot = await store.read();
      const seen = snapshot.idempotency[idempotencyKey];
      if (seen) {
        if (seen.request_hash_hex !== request_hash_hex) {
          res.status(409).json({ error: "idempotency key already used with different request payload" });
          return;
        }
        res.setHeader("idempotent-replay", "true");
        res.status(seen.response_status).json(seen.response_body);
        return;
      }
    }

    const content_id = String(input.content_id ?? "").trim();
    const content_hash = String(input.content_hash ?? "").trim();
    if (!content_id || !/^sha256:[0-9a-f]{64}$/i.test(content_hash)) {
      res.status(400).json({ error: "content_id and sha256 content_hash are required" });
      return;
    }
    if (!input.idkit_response) {
      res.status(400).json({ error: "idkit_response is required" });
      return;
    }
    const verification_policy: VerificationPolicy =
      input.verification_policy === "orb" || input.verification_policy === "device" ? input.verification_policy : "either";

    const verification = await verifyWorldSignature({
      content_hash,
      idkit_response: input.idkit_response,
      world_rp_id: cfg.worldRpId,
      world_verify_base_url: cfg.worldVerifyBaseUrl,
      world_api_key: cfg.worldApiKey,
      verification_policy,
    });

    const result = await provenance.ingest(
      {
        content_id,
        content_hash,
        idkit_response: input.idkit_response,
        parents: Array.isArray(input.parents) ? input.parents : [],
      },
      verification,
    );

    const responseBody = {
      ok: true,
      content: result.content,
      attestation: result.attestation,
      verification,
    };

    if (idempotencyKey) {
      const snapshot = await store.read();
      await store.write({
        ...snapshot,
        idempotency: {
          ...snapshot.idempotency,
          [idempotencyKey]: {
            key: idempotencyKey,
            request_hash_hex,
            response_status: 200,
            response_body: responseBody,
            created_at_ms: Date.now(),
          },
        },
      });
    }

    res.status(200).json(responseBody);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/v1/content/:contentId", async (req, res) => {
  const row = await provenance.getContent(req.params.contentId);
  if (!row) {
    res.status(404).json({ error: "content not found" });
    return;
  }
  res.json({ ok: true, content: row });
});

app.get("/v1/content/:contentId/provenance", async (req, res) => {
  const graph = await provenance.getProvenance(req.params.contentId);
  if (!graph) {
    res.status(404).json({ error: "content not found" });
    return;
  }
  res.json({ ok: true, provenance: graph });
});

app.get("/v1/attestation/:attestationId", async (req, res) => {
  const att = await provenance.getAttestation(req.params.attestationId);
  if (!att) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }
  const verification = await provenance.getVerification(att.verification_id);
  const mode = req.query.mode === "full" ? "full" : "minimal";
  if (mode === "minimal") {
    res.json({
      ok: true,
      mode,
      attestation: {
        attestation_id: att.attestation_id,
        content_id: att.content_id,
        content_hash: att.content_hash,
        created_at_ms: att.created_at_ms,
        tee_mode: att.tee_mode,
        verifier_binary_hash: att.verifier_binary_hash,
        public_values_commitment_hash_hex: att.public_values_commitment_hash_hex,
        signature_algorithm: att.signature_algorithm,
        signature_b64: att.signature_b64,
        signing_public_key_pem: att.signing_public_key_pem,
        verification_id: att.verification_id,
      },
      verification: verification
        ? {
            verification_id: verification.verification_id,
            verified: verification.verified,
            decision: verification.decision,
            reject_reason: verification.reject_reason,
            verification_level: verification.verification_level,
            verification_policy: verification.verification_policy,
            signal: verification.signal,
            request_hash_hex: verification.request_hash_hex,
            response_hash_hex: verification.response_hash_hex,
          }
        : null,
    });
    return;
  }

  res.json({ ok: true, mode, attestation: att, verification });
});

app.get("/v1/attestation/:attestationId/verify", async (req, res) => {
  const att = await provenance.getAttestation(req.params.attestationId);
  if (!att) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }

  const content = await provenance.getContent(att.content_id);
  const verification = await provenance.getVerification(att.verification_id);
  const report = verifyAttestationRecord(att, content, verification);
  res.json({ ok: true, attestation_id: att.attestation_id, ...report });
});

app.post("/mcp/tool", async (req, res) => {
  try {
    if (cfg.mcpApiKey) {
      const incomingApiKey = String(req.headers["x-mcp-key"] ?? "").trim();
      if (!incomingApiKey || incomingApiKey !== cfg.mcpApiKey) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
    }

    const call = req.body as McpToolCall;
    const result = await runMcpTool(provenance, call);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.listen(cfg.port, cfg.host, () => {
  console.log(`livy-provenance-backend listening on http://${cfg.host}:${cfg.port}`);
});
