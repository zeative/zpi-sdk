import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { buildDescriptor, run } from "../src/resources/exec";

/**
 * `ttl` — a caller-supplied cache max-age, gated to paid plans server-side.
 *
 * It rides in the same param bag the endpoint's own params use rather than
 * getting its own transport: /v1 merges query and body into one input and
 * strips `ttl` there, so a GET carries it in the query string and a POST in the
 * body with no branch here. The gate, the plan floor and the clamp all stay on
 * the server — the SDK must not second-guess any of them.
 */

const OK = { project: "p", data: { ok: 1 }, timestamp: "t" };

function capturing() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(OK), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fn, calls };
}

const cfg = (fetch: typeof globalThis.fetch) =>
  resolveConfig({ apiKey: "k", fetch, baseUrl: "https://api.test" });

describe("run() with a ttl option", () => {
  it("sends ttl in the query string on a GET", async () => {
    const { fn, calls } = capturing();

    await run(cfg(fn), "cat:s", "ep", { q: "x" }, { method: "GET", ttl: 30 });

    expect(new URL(calls[0].url).searchParams.get("ttl")).toBe("30");
  });

  // 0 is the most permissive request ("always fresh"), not an absent one.
  it("sends ttl=0 rather than dropping it", async () => {
    const { fn, calls } = capturing();

    await run(cfg(fn), "cat:s", "ep", { q: "x" }, { method: "GET", ttl: 0 });

    expect(new URL(calls[0].url).searchParams.get("ttl")).toBe("0");
  });

  it("sends ttl in the body on a POST", async () => {
    const { fn, calls } = capturing();

    await run(cfg(fn), "cat:s", "ep", { q: "x" }, { method: "POST", ttl: 30 });

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ q: "x", ttl: 30 });
  });

  it("works with no endpoint params of its own", async () => {
    const { fn, calls } = capturing();

    await run(cfg(fn), "cat:s", "ep", undefined, { method: "GET", ttl: 45 });

    expect(new URL(calls[0].url).searchParams.get("ttl")).toBe("45");
  });

  it("omits ttl entirely when not asked for", async () => {
    const { fn, calls } = capturing();

    await run(cfg(fn), "cat:s", "ep", { q: "x" }, { method: "GET" });

    expect(new URL(calls[0].url).searchParams.has("ttl")).toBe(false);
  });

  // The descriptor is what codegen and the retry/verb-flip path both re-read,
  // so ttl has to survive as a param rather than living only on the opts bag.
  it("keeps ttl on the descriptor params so a verb flip carries it", () => {
    const d = buildDescriptor("cat:s", "ep", { q: "x" }, { ttl: 30 });

    expect(d.params).toEqual({ q: "x", ttl: 30 });
  });
});
