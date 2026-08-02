// The SINGLE fetch seam. Only this module calls `config.fetch`. It injects auth,
// builds the URL, composes timeout + external-signal abort, retries safely, and
// unwraps the {project,data,timestamp} envelope on 200.
import type { ResolvedConfig } from "./config";
import {
  expectedMethodFrom,
  fromResponse,
  ZpiAbortError,
  ZpiError,
  ZpiNetworkError,
  ZpiTimeoutError,
} from "./errors";
import { appendQuery, buildUrl } from "./url";

export type HttpMethod = "GET" | "POST";

// GET, not POST: 175 of the catalog's 181 endpoints are GET, so guessing POST
// made ~97% of cold calls pay a wasted 405 round trip. GET is also the SAFE
// direction to be wrong in — a GET→POST correction carries the full body, while
// POST→GET has to squeeze params into a query string.
export const DEFAULT_METHOD: HttpMethod = "GET";

export interface ReqDescriptor {
  projectKey: string;
  endpoint: string;
  method?: HttpMethod;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  pathRest?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  // True when the caller did NOT pass an explicit method — a 405 is then resolved
  // from the server's stated `expected` verb and memoized in config.methodMemo.
  autoMethod?: boolean;
}

function memoKey(d: ReqDescriptor): string {
  return `${d.projectKey}/${d.endpoint}`;
}

// The verb to retry a 405 with. Prefer what the server actually said
// (content.expected / Allow); fall back to the old toggle when it says nothing.
// Returns undefined when there is nothing new to try, so callers surface the 405.
function retryMethodFor(
  current: HttpMethod,
  body: unknown,
  headers: Headers
): HttpMethod | undefined {
  const stated = expectedMethodFrom(body, headers);
  if (stated === "GET" || stated === "POST") {
    return stated === current ? undefined : stated;
  }
  // A verb we cannot speak (PUT/PATCH/…) — flipping would just burn a request.
  if (stated) return undefined;
  return current === "POST" ? "GET" : "POST";
}

// Rebuild url+init for a verb: GET carries params in the query string, POST in
// the JSON body. Used by the initial build AND the 405 auto-flip.
function buildRequest(
  config: ResolvedConfig,
  descriptor: ReqDescriptor,
  method: HttpMethod
): { url: string; init: RequestInit } {
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
  return { url, init };
}

// Bare-body descriptor: either a raw absolute `url` (status GET) OR the
// projectKey/endpoint/pathRest trio (submit POST → buildUrl).
export interface BareDescriptor {
  url?: string;
  projectKey?: string;
  endpoint?: string;
  pathRest?: string;
  method?: "GET" | "POST";
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
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
  let method = descriptor.method ?? DEFAULT_METHOD;
  let { url, init } = buildRequest(config, descriptor, method);
  let corrected = false;

  const timeoutMs = descriptor.timeoutMs ?? config.timeoutMs;
  const maxRetries = config.maxRetries;
  let retryable = isRetryEligible(method, descriptor.idempotencyKey);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchOnce(config, url, init, descriptor.signal, timeoutMs);
      const body = await res.json().catch(() => undefined);

      if (!res.ok) {
        // Wrong verb → adopt the one the server named, and remember it.
        if (res.status === 405 && descriptor.autoMethod && !corrected) {
          const next = retryMethodFor(method, body, res.headers);
          if (next) {
            corrected = true;
            method = next;
            ({ url, init } = buildRequest(config, descriptor, method));
            retryable = isRetryEligible(method, descriptor.idempotencyKey);
            config.methodMemo.set(memoKey(descriptor), method);
            // A verb correction is not a retry — it must not eat the caller's
            // retry budget, or a later 429 gets fewer attempts than configured.
            attempt--;
            continue;
          }
        }
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
  let method = descriptor.method ?? DEFAULT_METHOD;
  let { url, init } = buildRequest(config, descriptor, method);

  const timeoutMs = descriptor.timeoutMs ?? config.timeoutMs;
  let res = await fetchOnce(config, url, init, descriptor.signal, timeoutMs);

  // Wrong verb → adopt the one the server named (pre-stream, so this is safe).
  if (res.status === 405 && descriptor.autoMethod) {
    const errBody = await res.json().catch(() => undefined);
    const next = retryMethodFor(method, errBody, res.headers);
    if (next) {
      method = next;
      ({ url, init } = buildRequest(config, descriptor, method));
      config.methodMemo.set(memoKey(descriptor), method);
      res = await fetchOnce(config, url, init, descriptor.signal, timeoutMs);
    } else {
      throw fromResponse(res.status, errBody, res.headers);
    }
  }

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

// Bulk read/write path: returns the FULL parsed JSON body (no `.data`/`.content`
// unwrap — bulk submit/status responses are bare). Mirrors `request()`'s retry
// loop + header/body assembly; routes through the SAME `fetchOnce` seam. Accepts a
// raw absolute `url` (status GET) or the projectKey/endpoint trio (submit POST).
export async function requestBare<T = unknown>(
  config: ResolvedConfig,
  descriptor: BareDescriptor
): Promise<T> {
  // POST, not DEFAULT_METHOD: bulk submit is registered POST-only on the BE, and
  // bulk status passes GET explicitly. No verb guessing happens on this path.
  const method = descriptor.method ?? "POST";
  let url =
    descriptor.url ??
    buildUrl(
      config.baseURL,
      descriptor.projectKey ?? "",
      descriptor.endpoint ?? "",
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

      // Bare body — no envelope unwrap.
      return body as T;
    } catch (err) {
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
