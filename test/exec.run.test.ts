import { describe, expect, it, vi } from "vitest";
import { ZpiClient } from "../src/client";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

const ENVELOPE = { project: "p", data: { ok: 1 }, timestamp: "t" };

describe("ZpiClient.run", () => {
  it("returns the unwrapped .data, not the envelope", async () => {
    const f = fakeFetch(ENVELOPE);
    const client = new ZpiClient({ apiKey: "secret-key", fetch: f });
    const out = await client.run("social:instagram", "profile", {
      username: "x",
    });
    expect(out).toEqual({ ok: 1 });
  });

  it("sends x-api-key header at the single seam", async () => {
    const f = fakeFetch(ENVELOPE);
    const client = new ZpiClient({ apiKey: "secret-key", fetch: f });
    await client.run("social:instagram", "profile", { username: "x" });
    const init = f.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("secret-key");
  });

  it("defaults to POST with JSON body", async () => {
    const f = fakeFetch(ENVELOPE);
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.run("cat:s", "ep", { a: 1 });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(url).not.toContain("a=1");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("GET merges params into the query string, no body", async () => {
    const f = fakeFetch(ENVELOPE);
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.run("cat:s", "ep", { a: 1 }, { method: "GET" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(url).toContain("a=1");
    expect(init.body).toBeUndefined();
  });

  it("builds the /v1/{projectKey}/{endpoint} path with colon preserved", async () => {
    const f = fakeFetch(ENVELOPE);
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.run("social:instagram", "profile");
    const [url] = f.mock.calls[0] as [string];
    expect(url).toContain("/v1/social:instagram/profile");
  });

  it("throws on non-2xx with raw body attached", async () => {
    const f = fakeFetch({ message: "boom" }, 500);
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await expect(client.run("cat:s", "ep")).rejects.toMatchObject({
      raw: { message: "boom" },
    });
  });
});
