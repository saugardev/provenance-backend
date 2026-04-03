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
WORLD_VERIFY_BASE_URL=https://developer.world.org
WORLD_RP_ID=rp_xxx
WORLD_API_KEY=
TEE_MODE=mock
TEE_SERVICE_URL=http://127.0.0.1:3400
```

`TEE_MODE` values:
- `mock`: use in-process mock adapter
- `rust`: call Rust attestor service at `TEE_SERVICE_URL`

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
- `GET /v1/content/:contentId`
- `GET /v1/content/:contentId/provenance`
- `GET /v1/attestation/:attestationId` (default `mode=minimal`)
- `GET /v1/attestation/:attestationId?mode=full`

## Programmatic test

```bash
pnpm test
```

This starts a mock World verify endpoint and validates ingest + provenance API behavior.
It also validates signal mismatch rejection, policy mismatch rejection, and attestation `minimal/full` read modes.

## Tracking

Detailed execution plan: [`PLAN.md`](./PLAN.md)
