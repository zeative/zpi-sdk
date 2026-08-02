import { describe, expect, it, vi } from "vitest";
import { ZpiClient } from "../src/client";
import { ZpiMethodNotAllowedError } from "../src/core/errors";
import { normalizeEndpoint } from "../src/core/url";

const ENVELOPE = { project: "p", data: { ok: 1 }, timestamp: "t" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("normalizeEndpoint", () => {
  it("passes a plain slug through", () => {
    expect(normalizeEndpoint("profile")).toEqual({
      slug: "profile",
      rest: undefined,
    });
  });

  it("trims slashes", () => {
    expect(normalizeEndpoint("/profile/")).toEqual({
      slug: "profile",
      rest: undefined,
    });
  });

  it("drops :param placeholders (BE fills them from params)", () => {
    expect(normalizeEndpoint("resolve/:url")).toEqual({
      slug: "resolve",
      rest: undefined,
    });
    expect(normalizeEndpoint("/:test")).toEqual({ slug: ":test", rest: undefined });
  });

  it("keeps literal extra segments as pathRest", () => {
    expect(normalizeEndpoint("resolve/abc")).toEqual({
      slug: "resolve",
      rest: "abc",
    });
  });

  it("merges explicit pathRest after endpoint literals", () => {
    expect(normalizeEndpoint("users/:id/posts", "/42/")).toEqual({
      slug: "users",
      rest: "posts/42",
    });
  });
});

describe("run() forgiving endpoint", () => {
  it("strips :param from the endpoint — the param travels as a plain field", async () => {
    const f = vi.fn(async () => json(ENVELOPE));
    const client = new ZpiClient({
      apiKey: "k",
      fetch: f,
      methodMemo: new Map(),
    });
    await client.run("bypass-tools:encurtador", "resolve/:url", {
      url: "https://l1nq.com/x",
    });
    const [url] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/bypass-tools:encurtador/resolve");
    expect(url).not.toContain(":url");
    expect(new URL(url).searchParams.get("url")).toBe("https://l1nq.com/x");
  });
});

describe("codegen emit hardening", () => {
  it("quotes hyphenated endpoint slugs and field names, escapes */ in docs", async () => {
    const { emitScraperMap } = await import("../src/codegen/emit");
    const out = emitScraperMap(
      [
        {
          category: "finance",
          scraper: "idx",
          endpoints: [
            {
              slug: "broker-summary",
              schema: {
                fields: [
                  {
                    name: "start-date",
                    type: "string",
                    required: false,
                    description: "ends with */ badly",
                  },
                ],
              },
            },
          ],
        },
      ],
      { baseURL: "https://api.zpi.web.id" }
    );
    expect(out).toContain('"broker-summary": { params:');
    expect(out).toContain('"start-date"?: string;');
    expect(out).not.toMatch(/badly \*\/ \*\//);
    expect(out).toContain("*\\/ badly");
  });
});

describe("catalog forgiving slug", () => {
  it("accepts the run() project key — strips the category prefix", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ content: { slug: "bark" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.catalog.get("ai:bark");
    await client.catalog.schema("ai:bark", "synthesize");
    await client.catalog.stats("bark");
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/api/scrapers/bark");
    expect(urls[0]).not.toContain("ai%3A");
    expect(urls[1]).toContain("/scrapers/bark/endpoints/synthesize/schema");
    expect(urls[2]).toContain("/scrapers/bark/stats");
  });
});

// Every auto-method test gets its OWN memo: the default one is process-wide, so
// sharing it would let one test's learned verb decide another test's first call.
const isolated = (fetch: unknown) =>
  new ZpiClient({
    apiKey: "k",
    fetch: fetch as typeof globalThis.fetch,
    methodMemo: new Map(),
  });

// A 405 the way the BE actually sends it: content.expected + the RFC Allow header.
function mna(expected: string) {
  return new Response(
    JSON.stringify({
      content: { code: "method_not_allowed", expected },
      message: `Method X not allowed. Use ${expected}.`,
      errors: [],
    }),
    {
      status: 405,
      headers: { "content-type": "application/json", allow: expected },
    }
  );
}

describe("run() auto method", () => {
  it("defaults to GET — the catalog is 97% GET, so no probe is needed", async () => {
    const f = vi.fn(async () => json(ENVELOPE));
    await isolated(f).run("cat:s", "ep", { a: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(url).toContain("a=1");
  });

  it("adopts the verb the server names, and sends params as a body", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(mna("POST"))
      .mockResolvedValueOnce(json(ENVELOPE));
    const out = await isolated(f).run("cat:s", "ep", { a: 1 });
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    const [url2, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.method).toBe("POST");
    expect(url2).not.toContain("a=1");
    expect(init2.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("falls back to the GET↔POST toggle when the 405 names no verb", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "nope" }, 405))
      .mockResolvedValueOnce(json(ENVELOPE));
    await isolated(f).run("cat:s", "ep", { a: 1 });
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.method).toBe("POST");
  });

  it("does not retry a verb it cannot speak", async () => {
    const f = vi.fn(async () => mna("PUT"));
    const client = isolated(f);
    const err = await client.run("cat:s", "ep").catch((e) => e);
    expect(err).toBeInstanceOf(ZpiMethodNotAllowedError);
    expect(err.expected).toBe("PUT");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("memoizes the corrected verb — next call skips the 405 entirely", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(mna("POST"))
      .mockImplementation(async () => json(ENVELOPE));
    const client = isolated(f);
    await client.run("cat:s", "ep", { a: 1 });
    await client.run("cat:s", "ep", { a: 2 });
    expect(f).toHaveBeenCalledTimes(3);
    const [, init3] = f.mock.calls[2] as unknown as [string, RequestInit];
    expect(init3.method).toBe("POST");
  });

  it("shares learned verbs across clients in the same process", async () => {
    const shared = new Map<string, "GET" | "POST">();
    const f1 = vi
      .fn()
      .mockResolvedValueOnce(mna("POST"))
      .mockResolvedValueOnce(json(ENVELOPE));
    await new ZpiClient({
      apiKey: "k",
      fetch: f1 as unknown as typeof globalThis.fetch,
      methodMemo: shared,
    }).run("cat:s", "ep", { a: 1 });

    // A fresh client — the per-request construction serverless does.
    const f2 = vi.fn(async () => json(ENVELOPE));
    await new ZpiClient({
      apiKey: "k",
      fetch: f2 as unknown as typeof globalThis.fetch,
      methodMemo: shared,
    }).run("cat:s", "ep", { a: 2 });
    expect(f2).toHaveBeenCalledTimes(1);
    const [, init] = f2.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
  });

  it("does NOT correct when the caller passed an explicit method", async () => {
    const f = vi.fn(async () => mna("GET"));
    await expect(
      isolated(f).run("cat:s", "ep", {}, { method: "POST" })
    ).rejects.toBeInstanceOf(ZpiMethodNotAllowedError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("corrects only once — a second 405 throws", async () => {
    const f = vi.fn(async () => json({ message: "nope" }, 405));
    await expect(isolated(f).run("cat:s", "ep")).rejects.toBeInstanceOf(
      ZpiMethodNotAllowedError
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("useMethods() seeds the memo so the first call is already right", async () => {
    const f = vi.fn(async () => json(ENVELOPE));
    const client = isolated(f).useMethods({ "cat:s": { ep: "POST" } });
    await client.run("cat:s", "ep", { a: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
  });
});

describe("stream() auto method", () => {
  it("adopts the verb the server names before streaming", async () => {
    const stream = new Response("hello", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    const f = vi.fn().mockResolvedValueOnce(mna("POST")).mockResolvedValueOnce(stream);
    const client = isolated(f);
    const chunks: unknown[] = [];
    for await (const c of client.stream("cat:s", "ep", { q: 1 })) chunks.push(c);
    expect(chunks.join("")).toBe("hello");
    expect(f).toHaveBeenCalledTimes(2);
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.method).toBe("POST");
  });

  it("surfaces a 405 it cannot correct instead of hanging", async () => {
    const f = vi.fn(async () => mna("PUT"));
    const client = isolated(f);
    const err = await (async () => {
      try {
        for await (const _ of client.stream("cat:s", "ep")) break;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ZpiMethodNotAllowedError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
