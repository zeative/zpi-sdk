// Client construction + config resolution. Web-standard globals only (no node built-ins).

const DEFAULT_BASE_URL = "https://api.zpi.web.id";

/**
 * Learned HTTP verbs, shared by every client in the process.
 *
 * Was one Map per `ZpiClient`. Under serverless / per-request client
 * construction that memo never warmed, so every single call re-paid the verb
 * probe — the "sering kena 405" report. Contents are `"key/endpoint" -> verb`:
 * the same public fact the catalog serves, no credentials, nothing per-user.
 */
const sharedMethodMemo = new Map<string, "GET" | "POST">();

export interface ZpiClientOptions {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  /** Override the process-wide verb memo — pass a fresh Map for test isolation. */
  methodMemo?: Map<string, "GET" | "POST">;
}

export interface ResolvedConfig {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  // Learned HTTP verb per "projectKey/endpoint" — filled by catalog reads, by
  // codegen's baked map, and by 405 correction, so users never pass { method }.
  methodMemo: Map<string, "GET" | "POST">;
}

export function resolveConfig(opts: ZpiClientOptions): ResolvedConfig {
  if (!opts || typeof opts.apiKey !== "string" || opts.apiKey.length === 0) {
    throw new Error("ZpiClient: `apiKey` is required");
  }
  return {
    apiKey: opts.apiKey,
    baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
    defaultHeaders: opts.defaultHeaders ?? {},
    fetch: opts.fetch ?? globalThis.fetch,
    timeoutMs: opts.timeoutMs ?? 30000,
    maxRetries: opts.maxRetries ?? 2,
    baseRetryDelayMs: opts.baseRetryDelayMs ?? 200,
    methodMemo: opts.methodMemo ?? sharedMethodMemo,
  };
}
