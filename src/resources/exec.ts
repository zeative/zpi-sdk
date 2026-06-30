// run() — the FROZEN keystone signature (codegen emit target). Builds a request
// descriptor and delegates to the single core/http seam.
import type { ResolvedConfig } from "../core/config";
import { request, type ReqDescriptor } from "../core/http";

export interface RunOpts {
  method?: "GET" | "POST";
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  pathRest?: string;
}

// Codegen attaches concrete return types here via `declare module` merging.
// Empty by default → run() falls back to `unknown`.
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging target for codegen
export interface ScraperMap {}

export function buildDescriptor(
  projectKey: string,
  endpoint: string,
  params?: Record<string, unknown>,
  opts?: RunOpts
): ReqDescriptor {
  return {
    projectKey,
    endpoint,
    method: opts?.method ?? "POST",
    params,
    headers: opts?.headers,
    pathRest: opts?.pathRest,
  };
}

export function run<T = unknown>(
  config: ResolvedConfig,
  projectKey: string,
  endpoint: string,
  params?: Record<string, unknown>,
  opts?: RunOpts
): Promise<T> {
  return request<T>(config, buildDescriptor(projectKey, endpoint, params, opts));
}
