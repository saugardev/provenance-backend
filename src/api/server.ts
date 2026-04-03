import express from "express";
import { loadConfig } from "../config.js";
import { JsonStore } from "../storage/jsonStore.js";
import { MockTeeAdapter } from "../tee/mockAdapter.js";
import { HttpTeeAdapter } from "../tee/httpAdapter.js";
import { ProvenanceService } from "../services/provenanceService.js";
import { verifyWorldSignature } from "../services/worldVerifier.js";

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

    const verification = await verifyWorldSignature({
      content_hash,
      idkit_response: input.idkit_response,
      world_rp_id: cfg.worldRpId,
      world_verify_base_url: cfg.worldVerifyBaseUrl,
      world_api_key: cfg.worldApiKey,
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
  res.json({ ok: true, attestation: att, verification });
});

app.listen(cfg.port, cfg.host, () => {
  console.log(`livy-provenance-backend listening on http://${cfg.host}:${cfg.port}`);
});
