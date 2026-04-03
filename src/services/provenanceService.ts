import { nanoid } from "nanoid";
import type { AttestationRecord, ContentRecord, IngestInput, StoreShape, WorldVerification } from "../types.js";
import { JsonStore } from "../storage/jsonStore.js";
import type { TeeAdapter } from "../tee/adapter.js";

export class ProvenanceService {
  constructor(
    private readonly store: JsonStore,
    private readonly tee: TeeAdapter,
  ) {}

  async ingest(input: IngestInput, verification: WorldVerification): Promise<{ content: ContentRecord; attestation: AttestationRecord }> {
    if (!verification.verified) {
      throw new Error("world verification failed");
    }

    const snapshot = this.store.read();

    const parents = (input.parents ?? []).map((x) => x.trim()).filter(Boolean);
    for (const pid of parents) {
      if (!snapshot.contents[pid]) throw new Error(`parent content not found: ${pid}`);
    }

    const att = await this.tee.commit({
      content_id: input.content_id,
      content_hash: input.content_hash,
      verification_id: verification.verification_id,
      verification_level: verification.verification_level,
      nullifier_hash: verification.nullifier_hash,
      signal: verification.signal,
      action: verification.action,
      parent_ids: parents,
      created_at_ms: Date.now(),
    });

    const content: ContentRecord = {
      content_id: input.content_id,
      content_hash: input.content_hash,
      parents,
      created_at_ms: Date.now(),
      verification_id: verification.verification_id,
      attestation_id: `att_${nanoid(14)}`,
    };

    const attestation: AttestationRecord = {
      attestation_id: content.attestation_id,
      content_id: content.content_id,
      content_hash: content.content_hash,
      created_at_ms: Date.now(),
      tee_mode: att.tee_mode,
      verifier_binary_hash: att.verifier_binary_hash,
      public_values_b64: att.public_values_b64,
      public_values_commitment_hash_hex: att.public_values_commitment_hash_hex,
      signature_algorithm: "ed25519",
      signature_b64: att.signature_b64,
      signing_public_key_pem: att.signing_public_key_pem,
      verification_id: verification.verification_id,
    };

    const next: StoreShape = {
      ...snapshot,
      contents: {
        ...snapshot.contents,
        [content.content_id]: content,
      },
      verifications: {
        ...snapshot.verifications,
        [verification.verification_id]: verification,
      },
      attestations: {
        ...snapshot.attestations,
        [attestation.attestation_id]: attestation,
      },
    };

    this.store.write(next);
    return { content, attestation };
  }

  getContent(contentId: string) {
    return this.store.read().contents[contentId] ?? null;
  }

  getAttestation(attestationId: string) {
    return this.store.read().attestations[attestationId] ?? null;
  }

  getVerification(verificationId: string) {
    return this.store.read().verifications[verificationId] ?? null;
  }

  getProvenance(contentId: string) {
    const snapshot = this.store.read();
    const root = snapshot.contents[contentId];
    if (!root) return null;

    const nodes: ContentRecord[] = [];
    const edges: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();

    const walk = (id: string) => {
      if (seen.has(id)) return;
      const node = snapshot.contents[id];
      if (!node) return;
      seen.add(id);
      nodes.push(node);
      for (const parent of node.parents) {
        edges.push({ from: parent, to: id });
        walk(parent);
      }
    };

    walk(contentId);

    return { content_id: contentId, nodes, edges };
  }
}
