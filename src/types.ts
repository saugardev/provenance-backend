export type VerificationLevel = "orb" | "device";

export type IngestInput = {
  content_id: string;
  content_hash: string;
  idkit_response: unknown;
  parents?: string[];
};

export type WorldVerification = {
  verification_id: string;
  verified: boolean;
  rp_id: string;
  verification_level: VerificationLevel;
  nullifier_hash: string;
  merkle_root: string;
  action: string;
  signal: string;
  request_payload: unknown;
  response_payload: unknown;
  created_at_ms: number;
};

export type AttestationRecord = {
  attestation_id: string;
  content_id: string;
  content_hash: string;
  created_at_ms: number;
  tee_mode: "mock" | "real";
  verifier_binary_hash: string;
  public_values_b64: string;
  public_values_commitment_hash_hex: string;
  signature_algorithm: "ed25519";
  signature_b64: string;
  signing_public_key_pem: string;
  verification_id: string;
};

export type ContentRecord = {
  content_id: string;
  content_hash: string;
  parents: string[];
  created_at_ms: number;
  verification_id: string;
  attestation_id: string;
};

export type StoreShape = {
  contents: Record<string, ContentRecord>;
  verifications: Record<string, WorldVerification>;
  attestations: Record<string, AttestationRecord>;
};
