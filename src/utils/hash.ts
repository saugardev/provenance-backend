import { createHash } from "node:crypto";

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
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
