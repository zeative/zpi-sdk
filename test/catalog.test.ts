import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { ZpiNotFoundError } from "../src/core/errors";
import { createCatalog } from "../src/resources/catalog";

// Records the requested URL and replies with a {content,message,errors} envelope.
function fakeContentFetch(content: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({ content, message: "OK", errors: [] }),
      { status, headers: { "content-type": "application/json" } }
    );
  });
}

function catalogWith(content: unknown, status = 200) {
  const f = fakeContentFetch(content, status);
  const config = resolveConfig({ apiKey: "k", fetch: f });
  return { catalog: createCatalog(config), f };
}

function calledUrl(f: ReturnType<typeof fakeContentFetch>): string {
  return String(f.mock.calls[0][0]);
}

describe("catalog.list", () => {
  it("unwraps .content and passes q/cat/limit query params", async () => {
    const content = {
      items: [{ slug: "acme", displayName: "Acme" }],
      nextCursor: "24",
      total: 1,
    };
    const { catalog, f } = catalogWith(content);
    const out = await catalog.list({ q: "x", cat: "c", limit: 5 });

    const url = calledUrl(f);
    expect(url).toContain("/api/scrapers/list?");
    expect(url).toContain("q=x");
    expect(url).toContain("cat=c");
    expect(url).toContain("limit=5");
    expect(out).toEqual(content);
    expect(out.nextCursor).toBe("24");
  });

  it("works without params", async () => {
    const { catalog, f } = catalogWith({ items: [], nextCursor: null, total: 0 });
    await catalog.list();
    expect(calledUrl(f)).toContain("/api/scrapers/list");
  });
});

describe("catalog.get", () => {
  it("hits /api/scrapers/:slug and returns the detail content", async () => {
    const detail = { id: "1", slug: "acme", endpoints: [] };
    const { catalog, f } = catalogWith(detail);
    const out = await catalog.get("acme");
    expect(calledUrl(f)).toContain("/api/scrapers/acme");
    expect(out).toEqual(detail);
  });

  it("rejects with ZpiNotFoundError on 404", async () => {
    const { catalog } = catalogWith({ message: "Scraper not found" }, 404);
    await expect(catalog.get("missing")).rejects.toBeInstanceOf(
      ZpiNotFoundError
    );
  });
});

describe("catalog.categories", () => {
  it("hits /api/public/categories and returns the array", async () => {
    const cats = [{ slug: "social", displayName: "Social" }];
    const { catalog, f } = catalogWith(cats);
    const out = await catalog.categories();
    expect(calledUrl(f)).toContain("/api/public/categories");
    expect(out).toEqual(cats);
  });
});

describe("catalog.schema", () => {
  it("hits the schema path and preserves enumValues/in", async () => {
    const schema = {
      fields: [
        {
          name: "mode",
          type: "string",
          required: true,
          enumValues: ["a", "b"],
          in: "query",
        },
      ],
    };
    const { catalog, f } = catalogWith(schema);
    const out = await catalog.schema("acme", "run");
    expect(calledUrl(f)).toContain(
      "/api/public/scrapers/acme/endpoints/run/schema"
    );
    expect(out.fields[0].enumValues).toEqual(["a", "b"]);
    expect(out.fields[0].in).toBe("query");
  });
});

describe("catalog.stats", () => {
  it("hits /api/public/scrapers/:slug/stats and returns {requests,successRate}", async () => {
    const stats = { requests: 42, successRate: 99.5 };
    const { catalog, f } = catalogWith(stats);
    const out = await catalog.stats("acme");
    expect(calledUrl(f)).toContain("/api/public/scrapers/acme/stats");
    expect(out).toEqual(stats);
  });
});

describe("catalog auth-optional", () => {
  it("succeeds regardless of the key value on public routes", async () => {
    const f = fakeContentFetch([{ slug: "social", displayName: "Social" }]);
    const config = resolveConfig({ apiKey: "any-key", fetch: f });
    const catalog = createCatalog(config);
    const out = await catalog.categories();
    expect(out).toHaveLength(1);
  });
});
