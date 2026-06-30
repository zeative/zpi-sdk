// bulk.* — submit a bulk job (auto-reused Idempotency-Key) and await its terminal
// result via .wait() polling. Both submit + poll funnel through the SAME core/http
// `requestBare` seam (bare bodies, no envelope unwrap). Web-standard only:
// `crypto.randomUUID()` is a global (Node 20+/Bun/Deno/browsers) — NOT a node import.
import type { ResolvedConfig } from "../core/config";
import { requestBare } from "../core/http";
import { ZpiAbortError, ZpiTimeoutError } from "../core/errors";

// Prisma enums (verified from zpi-backend schema).
export type BulkJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type BulkItemStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

// Terminal job statuses — .wait() resolves on any of these (FAILED/CANCELLED
// resolve, they do NOT throw; per-item failures live in items[]).
export const TERMINAL_STATUSES: readonly BulkJobStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// A single item to submit. `url` is the common case; arbitrary params pass through.
export interface BulkItem {
  url?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

// Per-item result in a job status body.
export interface BulkItemResult {
  url?: string;
  params?: Record<string, unknown>;
  status: BulkItemStatus;
  data?: unknown;
  error?: unknown;
  latencyMs?: number;
}

// The bare status body returned by GET /v1/bulk/:jobId.
export interface BulkJobData {
  jobId: string;
  status: BulkJobStatus;
  total: number;
  succeeded?: number;
  failed?: number;
  scraperSlug?: string;
  endpointSlug?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  pollUrl?: string;
  items?: BulkItemResult[];
}

export interface BulkSubmitOpts {
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface BulkWaitOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (job: BulkJobData) => void;
}

const BACKOFF_CAP_MS = 5000;
const DEFAULT_POLL_BASE_MS = 500;

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError(signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(toAbortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function toAbortError(reason: unknown): ZpiAbortError {
  return new ZpiAbortError("Request aborted", reason);
}

// A handle over a submitted bulk job. Carries the 202 body fields + `.wait()`.
// NOTE: a client-side timeout/abort on .wait() leaves the job RUNNING server-side.
export class BulkJob {
  readonly jobId: string;
  readonly pollUrl?: string;
  readonly status?: BulkJobStatus;
  readonly total?: number;
  private readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig, body: Record<string, unknown>) {
    this.config = config;
    this.jobId = String(body.jobId);
    this.pollUrl =
      typeof body.pollUrl === "string" ? body.pollUrl : undefined;
    this.status =
      typeof body.status === "string"
        ? (body.status as BulkJobStatus)
        : undefined;
    this.total = typeof body.total === "number" ? body.total : undefined;
  }

  // Poll GET /v1/bulk/:jobId until a terminal status, firing onProgress each poll.
  // Resolves with the final job (incl. items[]). FAILED/CANCELLED RESOLVE; only
  // transport/timeout/abort throw. Honors timeoutMs (→ ZpiTimeoutError) + signal
  // (→ ZpiAbortError); the job keeps running server-side after a client abort.
  async wait(opts: BulkWaitOpts = {}): Promise<BulkJobData> {
    const { signal, timeoutMs, pollIntervalMs, onProgress } = opts;
    const base = pollIntervalMs ?? DEFAULT_POLL_BASE_MS;
    const deadline =
      timeoutMs !== undefined ? Date.now() + timeoutMs : undefined;

    for (let poll = 0; ; poll++) {
      if (signal?.aborted) throw toAbortError(signal.reason);
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new ZpiTimeoutError(
          `Bulk wait timed out after ${timeoutMs}ms`
        );
      }

      const remaining =
        deadline !== undefined ? deadline - Date.now() : undefined;
      const job = await statusOf(this.config, this.jobId, {
        signal,
        timeoutMs:
          remaining !== undefined ? Math.max(1, remaining) : undefined,
      });

      onProgress?.(job);

      if (isTerminal(job.status)) return job;

      if (deadline !== undefined && Date.now() >= deadline) {
        throw new ZpiTimeoutError(
          `Bulk wait timed out after ${timeoutMs}ms`
        );
      }

      const backoff =
        Math.min(BACKOFF_CAP_MS, base * 2 ** poll) + Math.random() * base;
      const wait =
        deadline !== undefined
          ? Math.min(backoff, Math.max(0, deadline - Date.now()))
          : backoff;
      await abortableSleep(wait, signal);
    }
  }
}

function statusOf(
  config: ResolvedConfig,
  jobId: string,
  opts: { signal?: AbortSignal; timeoutMs?: number }
): Promise<BulkJobData> {
  const base = config.baseURL.replace(/\/+$/, "");
  return requestBare<BulkJobData>(config, {
    url: `${base}/v1/bulk/${encodeURIComponent(jobId)}`,
    method: "GET",
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  });
}

export interface Bulk {
  submit(
    projectKey: string,
    endpoint: string,
    items: BulkItem[],
    opts?: BulkSubmitOpts
  ): Promise<BulkJob>;
  status(
    jobId: string,
    opts?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<BulkJobData>;
}

export function createBulk(config: ResolvedConfig): Bulk {
  return {
    async submit(projectKey, endpoint, items, opts) {
      // ONE key per logical submission, reused across retries (BULK-01).
      const idempotencyKey = opts?.idempotencyKey ?? crypto.randomUUID();
      const body = await requestBare<Record<string, unknown>>(config, {
        projectKey,
        endpoint,
        pathRest: "bulk",
        method: "POST",
        params: { items },
        idempotencyKey,
        signal: opts?.signal,
        timeoutMs: opts?.timeoutMs,
        headers: opts?.headers,
      });
      return new BulkJob(config, body ?? {});
    },
    status(jobId, opts) {
      return statusOf(config, jobId, {
        signal: opts?.signal,
        timeoutMs: opts?.timeoutMs,
      });
    },
  };
}
