import type { TeeAdapter, TeeCommitInput, TeeCommitOutput } from "./adapter.js";

export class HttpTeeAdapter implements TeeAdapter {
  constructor(private readonly baseUrl: string) {}

  async commit(input: TeeCommitInput): Promise<TeeCommitOutput> {
    const r = await fetch(`${this.baseUrl}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(`tee service error ${r.status}: ${JSON.stringify(payload)}`);
    }

    return payload as TeeCommitOutput;
  }
}
