import { verify as verifySignature } from "node:crypto";
import type { AttestationRecord, ContentRecord, WorldVerification } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type VerifyAttestationResult = {
  valid: boolean;
  checks: CheckResult[];
};

function decodePublicValues(b64: string): unknown[] {
  const wired = Buffer.from(b64, "base64");
  const out: unknown[] = [];
  let offset = 0;
  while (offset < wired.length) {
    if (offset + 4 > wired.length) {
      throw new Error("truncated public values length prefix");
    }
    const len = wired.readUInt32LE(offset);
    offset += 4;
    const end = offset + len;
    if (end > wired.length) {
      throw new Error("truncated public values payload");
    }
    const raw = wired.subarray(offset, end).toString("utf8");
    out.push(JSON.parse(raw));
    offset = end;
  }
  return out;
}

export function verifyAttestationRecord(
  attestation: AttestationRecord,
  content: ContentRecord | null,
  verification: WorldVerification | null,
): VerifyAttestationResult {
  const checks: CheckResult[] = [];

  let wired: Buffer | null = null;
  try {
    wired = Buffer.from(attestation.public_values_b64, "base64");
    checks.push({ name: "public_values_base64", ok: wired.length > 0, detail: `len=${wired.length}` });
  } catch (err) {
    checks.push({ name: "public_values_base64", ok: false, detail: String(err) });
  }

  if (wired) {
    const commitment = sha256Hex(wired);
    checks.push({
      name: "commitment_matches_public_values",
      ok: commitment === attestation.public_values_commitment_hash_hex,
      detail: commitment,
    });

    const message = Buffer.from(
      `livy-tee-v1|${attestation.content_id}|${attestation.public_values_commitment_hash_hex}`,
      "utf8",
    );
    let signatureOk = false;
    try {
      const sig = Buffer.from(attestation.signature_b64, "base64");
      signatureOk = verifySignature(null, message, attestation.signing_public_key_pem, sig);
    } catch {}
    checks.push({
      name: "signature_valid",
      ok: signatureOk,
      detail: signatureOk ? "ed25519 signature valid" : "signature verification failed",
    });
  }

  if (!content) {
    checks.push({ name: "content_exists", ok: false, detail: "content row missing" });
  } else {
    checks.push({ name: "content_exists", ok: true, detail: content.content_id });
  }

  if (!verification) {
    checks.push({ name: "verification_exists", ok: false, detail: "world verification row missing" });
  } else {
    checks.push({ name: "verification_exists", ok: true, detail: verification.verification_id });
    checks.push({
      name: "verification_decision_accepted",
      ok: verification.decision === "accepted" && verification.verified,
      detail: `${verification.decision}/${verification.verified}`,
    });
  }

  try {
    const decoded = decodePublicValues(attestation.public_values_b64);
    checks.push({ name: "public_values_decode", ok: true, detail: `items=${decoded.length}` });
    checks.push({
      name: "public_values_shape_v1",
      ok: decoded.length === 11,
      detail: `len=${decoded.length}`,
    });
    checks.push({
      name: "public_values_content_id_match",
      ok: String(decoded[0] ?? "") === attestation.content_id,
      detail: String(decoded[0] ?? ""),
    });
    checks.push({
      name: "public_values_content_hash_match",
      ok: String(decoded[1] ?? "") === attestation.content_hash,
      detail: String(decoded[1] ?? ""),
    });
    checks.push({
      name: "public_values_verification_id_match",
      ok: String(decoded[2] ?? "") === attestation.verification_id,
      detail: String(decoded[2] ?? ""),
    });

    if (verification) {
      checks.push({
        name: "public_values_signal_match",
        ok: String(decoded[5] ?? "") === `world:signal:${verification.signal}`,
        detail: String(decoded[5] ?? ""),
      });
      checks.push({
        name: "public_values_action_match",
        ok: String(decoded[6] ?? "") === `world:action:${verification.action}`,
        detail: String(decoded[6] ?? ""),
      });
      checks.push({
        name: "public_values_level_match",
        ok: String(decoded[3] ?? "") === `world:level:${verification.verification_level}`,
        detail: String(decoded[3] ?? ""),
      });
      checks.push({
        name: "public_values_request_hash_match",
        ok: String(decoded[7] ?? "") === `world:request_hash:${verification.request_hash_hex}`,
        detail: String(decoded[7] ?? ""),
      });
      checks.push({
        name: "public_values_response_hash_match",
        ok: String(decoded[8] ?? "") === `world:response_hash:${verification.response_hash_hex}`,
        detail: String(decoded[8] ?? ""),
      });
    }
  } catch (err) {
    checks.push({ name: "public_values_decode", ok: false, detail: String(err) });
  }

  return { valid: checks.every((x) => x.ok), checks };
}
