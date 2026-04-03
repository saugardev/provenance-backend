# livy-provenance-backend Plan

## Goals

1. Verify World ID signatures/proofs on backend.
2. Execute verification + commitment in TEE and attest that process.
3. Expose API to fetch content + full provenance.
4. Expose MCP interface for agents to query what is real.

## Current Status

- [x] Repo scaffold created.
- [x] Baseline API routes created.
- [x] World verification service created.
- [x] TEE adapter interface + mock adapter created.
- [x] Provenance storage and graph read model created.
- [x] MCP tool skeleton created.
- [x] Rust TEE service scaffold wired to livy-tee (`tee-attestor-rs` + HTTP adapter).
- [x] Full attestation evidence schema v1 (request/response hashes + decision + mode-specific attestation read).
- [ ] API auth/rate limiting.
- [ ] MCP server transport + auth.
- [ ] Production database storage.

## Phase Breakdown

## Phase 1: Verification Core

- [x] Accept raw `idkitResponse` and forward as-is to `/api/v4/verify/{rp_id}`.
- [x] Enforce `signal == content_hash`.
- [x] Support `orb` and `device` policies.
- [x] Persist request+response hash and decision.

## Phase 2: TEE Commitment

- [x] Define canonical public values schema v1.
- [x] Commit world verification evidence hash + content hash.
- [ ] Produce quote/token + user minimal proof payload.
- [x] Add independent recompute verification endpoint (`GET /v1/attestation/:id/verify`).

## Phase 3: Provenance API

- [ ] `POST /v1/ingest` final contract.
- [ ] `GET /v1/content/:id`.
- [ ] `GET /v1/content/:id/provenance`.
- [x] `GET /v1/attestation/:id` minimal/full modes.

## Phase 4: MCP

- [x] MCP tools: `get_content`, `get_provenance`, `verify_attestation`, `search_by_hash`.
- [ ] Agent-safe response schema with verification reasons.
- [ ] End-to-end agent scenario tests.

## Phase 5: Hardening

- [ ] Signed audit log.
- [ ] Access controls.
- [ ] Replay protections and idempotency keys.
- [ ] Monitoring + SLOs.
