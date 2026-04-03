import express from "express";
import { loadConfig } from "../config.js";
import { JsonStore } from "../storage/jsonStore.js";
import { MockTeeAdapter } from "../tee/mockAdapter.js";
import { HttpTeeAdapter } from "../tee/httpAdapter.js";
import { ProvenanceService } from "../services/provenanceService.js";
import { verifyWorldSignature } from "../services/worldVerifier.js";
import { verifyAttestationRecord } from "../services/attestationVerifier.js";
import type { VerificationPolicy } from "../types.js";

const cfg = loadConfig();
const store = new JsonStore(cfg.dataFile);
const tee = cfg.teeMode === "rust" ? new HttpTeeAdapter(cfg.teeServiceUrl) : new MockTeeAdapter();
const provenance = new ProvenanceService(store, tee);

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, tee_mode: cfg.teeMode, tee_service_url: cfg.teeServiceUrl, world_rp_id: cfg.worldRpId });
});

app.post("/v1/ingest", async (req, res) => {
  try {
    const input = req.body as {
      content_id?: string;
      content_hash?: string;
      idkit_response?: unknown;
      parents?: string[];
      verification_policy?: VerificationPolicy;
    };

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

    res.status(200).json({
      ok: true,
      content: result.content,
      attestation: result.attestation,
      verification,
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/v1/content/:contentId", (req, res) => {
  const row = provenance.getContent(req.params.contentId);
  if (!row) {
    res.status(404).json({ error: "content not found" });
    return;
  }
  res.json({ ok: true, content: row });
});

app.get("/v1/content/:contentId/provenance", (req, res) => {
  const graph = provenance.getProvenance(req.params.contentId);
  if (!graph) {
    res.status(404).json({ error: "content not found" });
    return;
  }
  res.json({ ok: true, provenance: graph });
});

app.get("/v1/attestation/:attestationId", (req, res) => {
  const att = provenance.getAttestation(req.params.attestationId);
  if (!att) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }
  const verification = provenance.getVerification(att.verification_id);
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

app.get("/v1/attestation/:attestationId/verify", (req, res) => {
  const att = provenance.getAttestation(req.params.attestationId);
  if (!att) {
    res.status(404).json({ error: "attestation not found" });
    return;
  }

  const content = provenance.getContent(att.content_id);
  const verification = provenance.getVerification(att.verification_id);
  const report = verifyAttestationRecord(att, content, verification);
  res.json({ ok: true, attestation_id: att.attestation_id, ...report });
});

app.listen(cfg.port, cfg.host, () => {
  console.log(`livy-provenance-backend listening on http://${cfg.host}:${cfg.port}`);
});
