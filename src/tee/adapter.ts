export type TeeCommitInput = {
  content_id: string;
  content_hash: string;
  verification_id: string;
  verification_level: "orb" | "device";
  nullifier_hash: string;
  signal: string;
  action: string;
  parent_ids: string[];
  created_at_ms: number;
};

export type TeeCommitOutput = {
  tee_mode: "mock" | "real";
  verifier_binary_hash: string;
  public_values_b64: string;
  public_values_commitment_hash_hex: string;
  signature_b64: string;
  signing_public_key_pem: string;
};

export interface TeeAdapter {
  commit(input: TeeCommitInput): Promise<TeeCommitOutput>;
}
