import { ProvenanceService } from "../services/provenanceService.js";
import { verifyAttestationRecord } from "../services/attestationVerifier.js";

export type McpToolCall =
  | { tool: "get_content"; content_id: string }
  | { tool: "get_provenance"; content_id: string }
  | { tool: "verify_attestation"; attestation_id: string }
  | { tool: "search_by_hash"; content_hash: string };

export async function runMcpTool(service: ProvenanceService, call: McpToolCall): Promise<unknown> {
  if (call.tool === "get_content") {
    return await service.getContent(call.content_id);
  }
  if (call.tool === "get_provenance") {
    return await service.getProvenance(call.content_id);
  }
  if (call.tool === "verify_attestation") {
    const att = await service.getAttestation(call.attestation_id);
    if (!att) return { valid: false, reason: "attestation not found" };
    const content = await service.getContent(att.content_id);
    const verification = await service.getVerification(att.verification_id);
    const report = verifyAttestationRecord(att, content, verification);
    return {
      valid: report.valid,
      verification_id: att.verification_id,
      commitment_hash: att.public_values_commitment_hash_hex,
      signature_algorithm: att.signature_algorithm,
      checks: report.checks,
    };
  }
  if (call.tool === "search_by_hash") {
    const rows = await service.findContentByHash(call.content_hash);
    return {
      count: rows.length,
      content_ids: rows.map((x) => x.content_id),
    };
  }
  return { error: "unknown tool" };
}
