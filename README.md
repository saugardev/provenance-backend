# livy-provenance-backend

Backend for verifying World ID proofs, attesting verification execution in TEE, and serving provenance via API + MCP.

## Run

```bash
cd /Users/saugardev/Documents/livylabs/livy-hackathon/livy-provenance-backend
pnpm install
pnpm dev
```

Server default: `http://127.0.0.1:3200`

## Environment

```bash
PORT=3200
HOST=127.0.0.1
STORAGE_MODE=json
DATA_FILE=data/store.json
DATABASE_URL=postgres://livy:livy@127.0.0.1:5432/livy_provenance
WORLD_VERIFY_BASE_URL=https://developer.world.org
WORLD_RP_ID=rp_xxx
WORLD_API_KEY=
TEE_MODE=mock
TEE_SERVICE_URL=http://127.0.0.1:3400
BACKEND_API_KEY=
MCP_API_KEY=
INGEST_RATE_LIMIT_PER_MINUTE=60
```

`TEE_MODE` values:
- `mock`: use in-process mock adapter
- `rust`: call Rust attestor service at `TEE_SERVICE_URL`

`STORAGE_MODE` values:
- `json`: local file (`DATA_FILE`)
- `postgres`: Postgres state store (`DATABASE_URL`)

## Local Postgres (docker compose)

```bash
pnpm db:up
```

Run backend on Postgres:

```bash
STORAGE_MODE=postgres DATABASE_URL=postgres://livy:livy@127.0.0.1:5432/livy_provenance pnpm dev
```

Stop:

```bash
pnpm db:down
```

## Public Values Schema (v1)

TEE commitments currently encode these values, in order:
1. `content_id`
2. `content_hash`
3. `verification_id`
4. `world:level:{orb|device}`
5. `world:nullifier:{hash}`
6. `world:signal:{content_hash}`
7. `world:action:{action}`
8. `world:request_hash:{sha256(stable(idkit_response))}`
9. `world:response_hash:{sha256(stable(world_verify_response))}`
10. `parent_ids` (array)
11. `created_at_ms`

## Rust TEE service (livy-tee bridge)

```bash
cd /Users/saugardev/Documents/livylabs/livy-hackathon/livy-provenance-backend
pnpm tee:dev
```

Then run backend with:

```bash
TEE_MODE=rust TEE_SERVICE_URL=http://127.0.0.1:3400 pnpm dev
```

## API

- `GET /healthz`
- `POST /v1/ingest` (`verification_policy`: `orb | device | either`, default `either`)
  - Optional auth via `x-api-key` when `BACKEND_API_KEY` is configured
  - Optional idempotency via `idempotency-key` header
- `GET /v1/content/:contentId`
- `GET /v1/content/:contentId/provenance`
- `GET /v1/attestation/:attestationId` (default `mode=minimal`)
- `GET /v1/attestation/:attestationId?mode=full`
- `GET /v1/attestation/:attestationId/verify` (recompute and verify commitment/signature/consistency)
- `POST /mcp/tool` (`x-mcp-key` required when `MCP_API_KEY` is set)

## Programmatic test

```bash
pnpm test
```

This starts a mock World verify endpoint and validates ingest + provenance API behavior.
It also validates ingest auth, rate limiting, idempotency replay behavior, signal mismatch rejection, policy mismatch rejection, attestation `minimal/full` read modes, attestation recompute verification, and MCP endpoint auth/calls.

## Tracking

Detailed execution plan: [`PLAN.md`](./PLAN.md)
