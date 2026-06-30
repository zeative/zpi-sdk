import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { request } from "../src/core/http";
import {
  ZpiAbortError,
  ZpiError,
  ZpiNetworkError,
  ZpiTimeoutError,
} from "../src/core/errors";

const DESC = { projectKey: "cat:s", endpoint: "ep", method: "GET" as const };

function cfg(overrides: Record<string, unknown>) {
  return resolveConfig({ apiKey: "k", ...overrides });
}

describe("timeout + abort composition", () => {
  it("throws ZpiTimeoutError when the fetch never resolves within timeoutMs", async () => {
    // a fetch that hangs forever unless its signal aborts
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        })
    );
    const config = cfg({ fetch: hang, timeoutMs: 20, maxRetries: 0 });
    const err = await request(config, DESC).catch((e) => e);
    expect(err).toBeInstanceOf(ZpiTimeoutError);
    expect(err).toBeInstanceOf(ZpiError);
  });

  it("clears the timer on success (no dangling timeout error)", async () => {
    vi.useRealTimers();
    const ok = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ project: "p", data: { ok: 1 }, timestamp: "t" }),
          { status: 200 }
        )
    );
    const config = cfg({ fetch: ok, timeoutMs: 50, maxRetries: 0 });
    const out = await request<{ ok: number }>(config, DESC);
    expect(out).toEqual({ ok: 1 });
  });

  it("throws ZpiAbortError for an already-aborted external signal", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted"))
          );
        })
    );
    const config = cfg({ fetch: hang, timeoutMs: 5000, maxRetries: 0 });
    const err = await request(config, {
      ...DESC,
      signal: ctrl.signal,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ZpiAbortError);
    expect(err).not.toBeInstanceOf(ZpiTimeoutError);
  });

  it("throws ZpiAbortError when the external signal aborts later", async () => {
    const ctrl = new AbortController();
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted"))
          );
        })
    );
    const config = cfg({ fetch: hang, timeoutMs: 5000, maxRetries: 0 });
    const p = request(config, { ...DESC, signal: ctrl.signal }).catch((e) => e);
    setTimeout(() => ctrl.abort(), 10);
    const err = await p;
    expect(err).toBeInstanceOf(ZpiAbortError);
  });

  it("maps a raw fetch network rejection to ZpiNetworkError with .cause", async () => {
    const cause = new TypeError("fetch failed");
    const boom = vi.fn(async () => {
      throw cause;
    });
    const config = cfg({ fetch: boom, maxRetries: 0 });
    const err = await request(config, DESC).catch((e) => e);
    expect(err).toBeInstanceOf(ZpiNetworkError);
    expect((err as ZpiNetworkError).cause).toBe(cause);
  });
});
