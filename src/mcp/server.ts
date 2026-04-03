import { ProvenanceService } from "../services/provenanceService.js";

export type McpToolCall =
  | { tool: "get_content"; content_id: string }
  | { tool: "get_provenance"; content_id: string }
  | { tool: "verify_attestation"; attestation_id: string };

export function runMcpTool(service: ProvenanceService, call: McpToolCall): unknown {
  if (call.tool === "get_content") {
    return service.getContent(call.content_id);
  }
  if (call.tool === "get_provenance") {
    return service.getProvenance(call.content_id);
  }
  if (call.tool === "verify_attestation") {
    const att = service.getAttestation(call.attestation_id);
    if (!att) return { valid: false, reason: "attestation not found" };
    return {
      valid: true,
      verification_id: att.verification_id,
      commitment_hash: att.public_values_commitment_hash_hex,
      signature_algorithm: att.signature_algorithm,
    };
  }
  return { error: "unknown tool" };
}
