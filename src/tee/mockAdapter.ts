import { generateKeyPairSync, sign } from "node:crypto";
import { sha256Hex, wirePublicValues } from "../utils/hash.js";
import type { TeeAdapter, TeeCommitInput, TeeCommitOutput } from "./adapter.js";

const keyPair = generateKeyPairSync("ed25519");
const privatePem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicPem = keyPair.publicKey.export({ format: "pem", type: "spki" }).toString();

export class MockTeeAdapter implements TeeAdapter {
  async commit(input: TeeCommitInput): Promise<TeeCommitOutput> {
    const publicValues = [
      input.content_id,
      input.content_hash,
      input.verification_id,
      `world:level:${input.verification_level}`,
      `world:nullifier:${input.nullifier_hash}`,
      `world:signal:${input.signal}`,
      `world:action:${input.action}`,
      ...input.parent_ids,
      input.created_at_ms,
    ];

    const wired = wirePublicValues(publicValues);
    const commitment = sha256Hex(wired);

    const message = Buffer.from(`livy-tee-v1|${input.content_id}|${commitment}`, "utf8");
    const sig = sign(null, message, privatePem).toString("base64");

    return {
      tee_mode: "mock",
      verifier_binary_hash: sha256Hex("livy-provenance-backend-mock-tee"),
      public_values_b64: wired.toString("base64"),
      public_values_commitment_hash_hex: commitment,
      signature_b64: sig,
      signing_public_key_pem: publicPem,
    };
  }
}
