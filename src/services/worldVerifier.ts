import { nanoid } from "nanoid";
import type { VerificationLevel, VerificationPolicy, WorldVerification } from "../types.js";
import { sha256ObjectHex } from "../utils/hash.js";

export type VerifyInput = {
  content_hash: string;
  idkit_response: unknown;
  world_rp_id: string;
  world_verify_base_url: string;
  world_api_key?: string;
  verification_policy: VerificationPolicy;
};

function parseVerificationFields(idkitResponse: any): {
  action: string;
  signal: string;
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: VerificationLevel;
} {
  const action = String(idkitResponse?.action ?? "").trim();
  const response0 = Array.isArray(idkitResponse?.responses) ? idkitResponse.responses[0] : undefined;
  const signal = String(idkitResponse?.signal ?? response0?.signal ?? "").trim();
  const proof = String(response0?.proof ?? "").trim();
  const merkle_root = String(response0?.merkle_root ?? "").trim();
  const nullifier_hash = String(response0?.nullifier ?? response0?.nullifier_hash ?? "").trim();
  const levelRaw = String(response0?.identifier ?? "").trim();
  const verification_level: VerificationLevel = levelRaw === "device" ? "device" : "orb";

  return {
    action,
    signal,
    proof,
    merkle_root,
    nullifier_hash,
    verification_level,
  };
}

export async function verifyWorldSignature(input: VerifyInput): Promise<WorldVerification> {
  const parsed = parseVerificationFields(input.idkit_response as any);

  if (!parsed.action || !parsed.proof || !parsed.merkle_root || !parsed.nullifier_hash) {
    throw new Error("idkit_response missing action/proof/merkle_root/nullifier fields");
  }

  if (parsed.signal !== input.content_hash) {
    throw new Error("signal must equal content_hash");
  }

  if (input.verification_policy !== "either" && parsed.verification_level !== input.verification_policy) {
    throw new Error(
      `verification level mismatch: expected ${input.verification_policy}, got ${parsed.verification_level}`,
    );
  }

  const url = `${input.world_verify_base_url}/api/v4/verify/${input.world_rp_id}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.world_api_key) headers.authorization = `Bearer ${input.world_api_key}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input.idkit_response),
  });

  const payload = await response.json().catch(() => ({}));
  const verified = response.ok && payload?.success === true;
  const decision: WorldVerification["decision"] = verified ? "accepted" : "rejected";
  const reject_reason = verified ? undefined : `world_verify_failed_http_${response.status}`;
  const request_hash_hex = sha256ObjectHex(input.idkit_response);
  const response_hash_hex = sha256ObjectHex(payload);

  return {
    verification_id: `wv_${nanoid(14)}`,
    verified,
    decision,
    reject_reason,
    rp_id: input.world_rp_id,
    verification_level: parsed.verification_level,
    verification_policy: input.verification_policy,
    nullifier_hash: parsed.nullifier_hash,
    merkle_root: parsed.merkle_root,
    action: parsed.action,
    signal: parsed.signal,
    request_hash_hex,
    response_hash_hex,
    request_payload: input.idkit_response,
    response_payload: payload,
    created_at_ms: Date.now(),
  };
}
