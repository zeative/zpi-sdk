// The SINGLE fetch seam. Only this module calls `config.fetch`. It injects auth,
// builds the URL, composes timeout + external-signal abort, retries safely, and
// unwraps the {project,data,timestamp} envelope on 200.
import type { ResolvedConfig } from "./config";
import {
  fromResponse,
  ZpiAbortError,
  ZpiError,
  ZpiNetworkError,
  ZpiTimeoutError,
} from "./errors";
import { appendQuery, buildUrl } from "./url";

export interface ReqDescriptor {
  projectKey: string;
  endpoint: string;
  method?: "GET" | "POST";
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  pathRest?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
}

// Sentinel reasons so the post-mortem can tell timeout vs external abort apart.
const TIMEOUT = Symbol("zpi-timeout");
const EXTERNAL = Symbol("zpi-external-abort");

export async function request<T = unknown>(
  config: ResolvedConfig,
  descriptor: ReqDescriptor
): Promise<T> {
  const method = descriptor.method ?? "POST";
  let url = buildUrl(
    config.baseURL,
    descriptor.projectKey,
    descriptor.endpoint,
    descriptor.pathRest
  );

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    ...descriptor.headers,
    "x-api-key": config.apiKey,
  };
  if (descriptor.idempotencyKey) {
    headers["Idempotency-Key"] = descriptor.idempotencyKey;
  }

  const init: RequestInit = { method, headers };
  if (method === "GET") {
    url = appendQuery(url, descriptor.params);
  } else if (descriptor.params !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(descriptor.params);
  }

  const timeoutMs = descriptor.timeoutMs ?? config.timeoutMs;
  const maxRetries = config.maxRetries;
  const retryable = isRetryEligible(method, descriptor.idempotencyKey);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchOnce(config, url, init, descriptor.signal, timeoutMs);
      const body = await res.json().catch(() => undefined);

      if (!res.ok) {
        // Decide retryability from the status BEFORE throwing the typed error.
        if (
          retryable &&
          attempt < maxRetries &&
          isRetryableStatus(res.status)
        ) {
          await sleep(
            delayFor(attempt, config.baseRetryDelayMs, res.status, body, res.headers),
            descriptor.signal
          );
          continue;
        }
        throw fromResponse(res.status, body, res.headers);
      }

      // Unwrap the {project,data,timestamp} envelope — return only `.data`.
      return (body as { data: T }).data;
    } catch (err) {
      // Transport-level retry: only ZpiNetworkError is retry-eligible here.
      if (
        retryable &&
        attempt < maxRetries &&
        err instanceof ZpiNetworkError
      ) {
        await sleep(
          delayFor(attempt, config.baseRetryDelayMs),
          descriptor.signal
        );
        continue;
      }
      throw err;
    }
  }
}

// Stream-mode read path through the SAME fetch seam. No retry loop (streams are
// not blind-retried); reads `res.body.getReader()` instead of `res.json()`.
export async function requestStream(
  config: ResolvedConfig,
  descriptor: ReqDescriptor
): Promise<{
  contentType: string;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}> {
  const method = descriptor.method ?? "POST";
  let url = buildUrl(
    config.baseURL,
    descriptor.projectKey,
    descriptor.endpoint,
    descriptor.pathRest
  );

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    ...descriptor.headers,
    "x-api-key": config.apiKey,
  };

  const init: RequestInit = { method, headers };
  if (method === "GET") {
    url = appendQuery(url, descriptor.params);
  } else if (descriptor.params !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(descriptor.params);
  }

  const timeoutMs = descriptor.timeoutMs ?? config.timeoutMs;
  const res = await fetchOnce(config, url, init, descriptor.signal, timeoutMs);

  if (!res.ok) {
    // Typed error precedes the stream — read the JSON body for the mapping.
    const body = await res.json().catch(() => undefined);
    throw fromResponse(res.status, body, res.headers);
  }
  if (!res.body) {
    throw new ZpiNetworkError("Stream response had no body");
  }

  return {
    contentType: res.headers.get("content-type") ?? "",
    reader: res.body.getReader(),
  };
}

// Catalog read path: raw absolute `url` (caller builds it under baseURL, NOT via
// buildUrl) + `.content` envelope unwrap. Auth-optional public routes; the key is
// sent but harmless. Single attempt — funnels through the same `fetchOnce` seam.
export async function requestContent<T = unknown>(
  config: ResolvedConfig,
  opts: {
    url: string;
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    "x-api-key": config.apiKey,
  };
  const url = appendQuery(opts.url, opts.params);
  const res = await fetchOnce(
    config,
    url,
    { method: "GET", headers },
    opts.signal,
    opts.timeoutMs ?? config.timeoutMs
  );

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw fromResponse(res.status, body, res.headers);
  }

  const body = await res.json().catch(() => undefined);
  return (body as { content: T }).content;
}

// Single fetch call site wrapped with timeout + external-signal composition.
async function fetchOnce(
  config: ResolvedConfig,
  url: string,
  init: RequestInit,
  external: AbortSignal | undefined,
  timeoutMs: number
): Promise<Response> {
  // Short-circuit an already-aborted external signal before touching fetch.
  if (external?.aborted) {
    throw new ZpiAbortError("Request aborted", external.reason);
  }

  const ctrl = new AbortController();
  let firedBy: typeof TIMEOUT | typeof EXTERNAL | undefined;

  const onExternal = () => {
    firedBy = EXTERNAL;
    ctrl.abort(EXTERNAL);
  };

  if (external) external.addEventListener("abort", onExternal);

  const timer = setTimeout(() => {
    firedBy = TIMEOUT;
    ctrl.abort(TIMEOUT);
  }, timeoutMs);

  try {
    return await config.fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted) {
      if (firedBy === EXTERNAL) {
        throw new ZpiAbortError("Request aborted", err);
      }
      throw new ZpiTimeoutError(`Request timed out after ${timeoutMs}ms`, err);
    }
    if (err instanceof ZpiError) throw err;
    throw new ZpiNetworkError("Network request failed", err);
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", onExternal);
  }
}

// POST is retry-eligible ONLY with an idempotency key; GET always by method.
function isRetryEligible(
  method: "GET" | "POST",
  idempotencyKey: string | undefined
): boolean {
  return method === "GET" || idempotencyKey !== undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

// Prefer server-directed delay (Retry-After header / 429 content.retryAfterSec),
// else exponential backoff base*2^attempt + jitter.
function delayFor(
  attempt: number,
  base: number,
  status?: number,
  body?: unknown,
  headers?: Headers
): number {
  const server = serverDelayMs(status, body, headers);
  if (server !== undefined) return server;
  const backoff = base * 2 ** attempt;
  return backoff + Math.random() * base;
}

function serverDelayMs(
  status: number | undefined,
  body: unknown,
  headers: Headers | undefined
): number | undefined {
  const ra = headers?.get?.("retry-after");
  if (ra) {
    const n = Number(ra);
    if (Number.isFinite(n)) return n * 1000;
  }
  if (status === 429 && body && typeof body === "object") {
    const content = (body as { content?: { retryAfterSec?: unknown } }).content;
    if (content && typeof content.retryAfterSec === "number") {
      return content.retryAfterSec * 1000;
    }
  }
  return undefined;
}

// Abortable sleep — rejects (ZpiAbortError) if the request signal fires mid-wait.
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ZpiAbortError("Request aborted", signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ZpiAbortError("Request aborted", signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
