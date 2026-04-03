import { createHash } from "node:crypto";

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function sha256ObjectHex(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function wirePublicValues(values: unknown[]): Buffer {
  const chunks: Buffer[] = [];
  for (const v of values) {
    const body = Buffer.from(JSON.stringify(v), "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length, 0);
    chunks.push(len, body);
  }
  return Buffer.concat(chunks);
}
