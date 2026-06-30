// Client construction + config resolution. Web-standard globals only (no node built-ins).

const DEFAULT_BASE_URL = "https://api.zpi.web.id";

export interface ZpiClientOptions {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface ResolvedConfig {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
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
  };
}
