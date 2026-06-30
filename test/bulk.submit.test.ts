import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { createBulk } from "../src/resources/bulk";
import {
  ZpiBulkCapError,
  ZpiBulkNotEnabledError,
  ZpiIdempotencyError,
} from "../src/core/errors";

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
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

const SUBMIT_OK = {
  jobId: "job-1",
  status: "QUEUED",
  total: 2,
  pollUrl: "/v1/bulk/job-1",
};

describe("bulk submit", () => {
  it("returns a BulkJob handle from the 202 body (single fetch, no retry)", async () => {
    const f = vi.fn(async () => json(SUBMIT_OK, 202));
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }, { url: "b" }]);
    expect(job.jobId).toBe("job-1");
    expect(job.pollUrl).toBe("/v1/bulk/job-1");
    expect(job.status).toBe("QUEUED");
    expect(job.total).toBe(2);
    expect(typeof job.wait).toBe("function");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("sends {items} body + Idempotency-Key header + POST to /bulk", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init };
      return json(SUBMIT_OK, 202);
    });
    const bulk = createBulk(cfg(f));
    await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    expect(captured?.url).toContain("/v1/cat:s/ep/bulk");
    expect(captured?.init?.method).toBe("POST");
    expect(JSON.parse(String(captured?.init?.body))).toEqual({
      items: [{ url: "a" }],
    });
    const key = new Headers(captured?.init?.headers).get("idempotency-key");
    expect(key).toBeTruthy();
  });

  it("auto-generates ONE Idempotency-Key and reuses it across a retried submit", async () => {
    const seen: Array<string | null> = [];
    let n = 0;
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("idempotency-key"));
      n++;
      if (n === 1) return json({ message: "down" }, 503);
      return json(SUBMIT_OK, 202);
    });
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    expect(job.jobId).toBe("job-1");
    expect(f).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBeTruthy();
    expect(seen).toEqual([seen[0], seen[0]]); // constant across retries
  });

  it("honors a caller-provided idempotencyKey override", async () => {
    const seen: Array<string | null> = [];
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("idempotency-key"));
      return json(SUBMIT_OK, 202);
    });
    const bulk = createBulk(cfg(f));
    await bulk.submit("cat:s", "ep", [{ url: "a" }], { idempotencyKey: "mine-1" });
    expect(seen).toEqual(["mine-1"]);
  });

  it("resolves an idempotency-replay (stored 202 body) as a normal handle", async () => {
    const f = vi.fn(async () => json(SUBMIT_OK, 202));
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    expect(job.jobId).toBe("job-1");
  });

  it("throws ZpiBulkCapError on a 400 bulk_cap_exceeded", async () => {
    const f = vi.fn(async () =>
      json({ error: { code: "bulk_cap_exceeded", message: "cap" }, cap: 10, submitted: 11 }, 400)
    );
    const bulk = createBulk(cfg(f));
    await expect(
      bulk.submit("cat:s", "ep", [{ url: "a" }])
    ).rejects.toBeInstanceOf(ZpiBulkCapError);
  });

  it("throws ZpiBulkNotEnabledError on a 403 bulk_not_enabled", async () => {
    const f = vi.fn(async () =>
      json({ error: { code: "bulk_not_enabled", message: "no" } }, 403)
    );
    const bulk = createBulk(cfg(f));
    await expect(
      bulk.submit("cat:s", "ep", [{ url: "a" }])
    ).rejects.toBeInstanceOf(ZpiBulkNotEnabledError);
  });

  it("throws ZpiIdempotencyError on a 422 idempotency_key_reuse", async () => {
    const f = vi.fn(async () =>
      json({ error: { code: "idempotency_key_reuse", message: "reuse" } }, 422)
    );
    const bulk = createBulk(cfg(f));
    await expect(
      bulk.submit("cat:s", "ep", [{ url: "a" }])
    ).rejects.toBeInstanceOf(ZpiIdempotencyError);
  });
});
