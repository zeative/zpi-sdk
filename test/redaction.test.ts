import { describe, expect, it, vi } from "vitest";
import { ZpiClient } from "../src/client";
import { buildDescriptor } from "../src/resources/exec";

const API_KEY = "super-secret-api-key-123";

describe("redaction", () => {
  it("apiKey is absent from JSON.stringify(client)", () => {
    const client = new ZpiClient({ apiKey: API_KEY });
    expect(JSON.stringify(client).includes(API_KEY)).toBe(false);
  });

  it("apiKey is absent from a serialized request descriptor", () => {
    const desc = buildDescriptor("cat:s", "ep", { a: 1 }, { method: "POST" });
    expect(JSON.stringify(desc).includes(API_KEY)).toBe(false);
  });

  it("apiKey does not surface on the happy-path resolved value", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ project: "p", data: { ok: 1 }, timestamp: "t" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const client = new ZpiClient({ apiKey: API_KEY, fetch: f });
    const out = await client.run("cat:s", "ep");
    expect(JSON.stringify(out).includes(API_KEY)).toBe(false);
  });
});
