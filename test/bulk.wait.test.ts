import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { createBulk, type BulkJobData } from "../src/resources/bulk";
import { ZpiAbortError, ZpiTimeoutError } from "../src/core/errors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cfg(fetch: typeof globalThis.fetch, overrides: Record<string, unknown> = {}) {
  return resolveConfig({ apiKey: "k", fetch, baseRetryDelayMs: 1, ...overrides });
}

const SUBMIT_OK = { jobId: "job-1", status: "QUEUED", total: 2, pollUrl: "/v1/bulk/job-1" };

// A fetch where the first call (submit) returns the 202 body, and subsequent
// calls (status polls) walk a scripted list of job-status bodies.
function submitThenPolls(polls: BulkJobData[]) {
  let pollIdx = 0;
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("/bulk/job-1")) {
      const body = polls[Math.min(pollIdx, polls.length - 1)];
      pollIdx++;
      return json(body);
    }
    return json(SUBMIT_OK, 202);
  });
}

const running = (): BulkJobData => ({
  jobId: "job-1",
  status: "RUNNING",
  total: 2,
  succeeded: 0,
  failed: 0,
});

describe("BulkJob.wait", () => {
  it("polls to COMPLETED, fires onProgress N times, resolves with items[]", async () => {
    const completed: BulkJobData = {
      jobId: "job-1",
      status: "COMPLETED",
      total: 2,
      succeeded: 2,
      failed: 0,
      items: [
        { url: "a", status: "SUCCEEDED", data: { ok: 1 } },
        { url: "b", status: "SUCCEEDED", data: { ok: 2 } },
      ],
    };
    const f = submitThenPolls([running(), running(), completed]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }, { url: "b" }]);

    const progress: string[] = [];
    const final = await job.wait({
      pollIntervalMs: 1,
      onProgress: (j) => progress.push(j.status),
    });

    expect(final.status).toBe("COMPLETED");
    expect(final.items).toHaveLength(2);
    expect(progress).toEqual(["RUNNING", "RUNNING", "COMPLETED"]); // 3 polls
  });

  it("RESOLVES (not throws) on a FAILED terminal status with items[]", async () => {
    const failed: BulkJobData = {
      jobId: "job-1",
      status: "FAILED",
      total: 1,
      succeeded: 0,
      failed: 1,
      items: [{ url: "a", status: "FAILED", error: "boom" }],
    };
    const f = submitThenPolls([failed]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    const final = await job.wait({ pollIntervalMs: 1 });
    expect(final.status).toBe("FAILED");
    expect(final.items?.[0]?.error).toBe("boom");
  });

  it("RESOLVES on a CANCELLED terminal status", async () => {
    const f = submitThenPolls([{ jobId: "job-1", status: "CANCELLED", total: 1 }]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    const final = await job.wait({ pollIntervalMs: 1 });
    expect(final.status).toBe("CANCELLED");
  });

  it("throws ZpiTimeoutError when timeoutMs elapses mid-poll (status never terminal)", async () => {
    const f = submitThenPolls([running()]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    await expect(
      job.wait({ pollIntervalMs: 5, timeoutMs: 15 })
    ).rejects.toBeInstanceOf(ZpiTimeoutError);
  });

  it("throws ZpiAbortError when an external signal aborts mid-poll", async () => {
    const f = submitThenPolls([running()]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    const ctrl = new AbortController();
    const p = job.wait({ pollIntervalMs: 50, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toBeInstanceOf(ZpiAbortError);
  });

  it("throws ZpiAbortError for an already-aborted signal", async () => {
    const f = submitThenPolls([running()]);
    const bulk = createBulk(cfg(f));
    const job = await bulk.submit("cat:s", "ep", [{ url: "a" }]);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      job.wait({ pollIntervalMs: 1, signal: ctrl.signal })
    ).rejects.toBeInstanceOf(ZpiAbortError);
  });

  it("status() does a one-shot read of GET /v1/bulk/:jobId", async () => {
    const f = submitThenPolls([{ jobId: "job-1", status: "RUNNING", total: 1 }]);
    const bulk = createBulk(cfg(f));
    const data = await bulk.status("job-1");
    expect(data.jobId).toBe("job-1");
    expect(data.status).toBe("RUNNING");
  });
});
