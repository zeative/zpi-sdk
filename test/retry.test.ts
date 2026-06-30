import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { request } from "../src/core/http";
import { ZpiNetworkError, ZpiNotFoundError } from "../src/core/errors";

const OK = { project: "p", data: { ok: 1 }, timestamp: "t" };

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// A fetch backed by a queue of scripted responses; counts invocations.
function scripted(steps: Array<() => Promise<Response>>) {
  let i = 0;
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    return step();
  });
  return fn;
}

function cfg(fetch: typeof globalThis.fetch, overrides: Record<string, unknown> = {}) {
  return resolveConfig({
    apiKey: "k",
    fetch,
    baseRetryDelayMs: 1,
    maxRetries: 2,
    ...overrides,
  });
}

const GET = { projectKey: "cat:s", endpoint: "ep", method: "GET" as const };

describe("retry taxonomy", () => {
  it("retries 429 then resolves; honors content.retryAfterSec", async () => {
    const f = scripted([
      async () => json({ content: { retryAfterSec: 0 } }, 429),
      async () => json(OK, 200),
    ]);
    const out = await request(cfg(f), GET);
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("retries 503 then resolves", async () => {
    const f = scripted([
      async () => json({ message: "down" }, 503),
      async () => json(OK, 200),
    ]);
    const out = await request(cfg(f), GET);
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("retries on a network error then resolves", async () => {
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      return json(OK, 200);
    });
    const out = await request(cfg(f), GET);
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 404", async () => {
    const f = scripted([async () => json({ message: "nope" }, 404)]);
    await expect(request(cfg(f), GET)).rejects.toBeInstanceOf(ZpiNotFoundError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 400 or 403", async () => {
    const f400 = scripted([async () => json({ message: "bad" }, 400)]);
    await expect(request(cfg(f400), GET)).rejects.toBeTruthy();
    expect(f400).toHaveBeenCalledTimes(1);

    const f403 = scripted([async () => json({ error: { message: "gate" } }, 403)]);
    await expect(request(cfg(f403), GET)).rejects.toBeTruthy();
    expect(f403).toHaveBeenCalledTimes(1);
  });

  it("does NOT blind-retry an un-keyed POST", async () => {
    const f = scripted([async () => json({ message: "down" }, 503)]);
    await expect(
      request(cfg(f), { projectKey: "cat:s", endpoint: "ep", method: "POST" })
    ).rejects.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a keyed POST and reuses the same Idempotency-Key on every attempt", async () => {
    const seen: Array<string | null> = [];
    let n = 0;
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("idempotency-key"));
      n++;
      if (n === 1) return json({ message: "down" }, 503);
      return json(OK, 200);
    });
    const out = await request(cfg(f), {
      projectKey: "cat:s",
      endpoint: "ep",
      method: "POST",
      idempotencyKey: "idem-123",
    });
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["idem-123", "idem-123"]);
  });

  it("caps total attempts at maxRetries + 1", async () => {
    const f = scripted([async () => json({ message: "down" }, 503)]);
    await expect(request(cfg(f, { maxRetries: 2 }), GET)).rejects.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("network error is exhausted to ZpiNetworkError after the cap", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(request(cfg(f, { maxRetries: 1 }), GET)).rejects.toBeInstanceOf(
      ZpiNetworkError
    );
    expect(f).toHaveBeenCalledTimes(2);
  });
});
