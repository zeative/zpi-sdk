// The SINGLE fetch seam. Only this module calls `config.fetch`. It injects auth,
// builds the URL, and unwraps the {project,data,timestamp} envelope on 200.
import type { ResolvedConfig } from "./config";
import { appendQuery, buildUrl } from "./url";

export interface ReqDescriptor {
  projectKey: string;
  endpoint: string;
  method?: "GET" | "POST";
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  pathRest?: string;
}

// Minimal placeholder thrower — plan 02 swaps this for the typed hierarchy
// (fromResponse) without touching the call path.
function throwForResponse(
  status: number,
  body: unknown,
  _headers: Headers
): never {
  const err = new Error(`Zapi request failed with status ${status}`) as Error & {
    status: number;
    raw: unknown;
  };
  err.status = status;
  err.raw = body;
  throw err;
}

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

  const init: RequestInit = { method, headers };

  if (method === "GET") {
    url = appendQuery(url, descriptor.params);
  } else if (descriptor.params !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(descriptor.params);
  }

  const res = await config.fetch(url, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throwForResponse(res.status, body, res.headers);
  }

  // Unwrap the {project,data,timestamp} envelope — return only `.data`.
  return (body as { data: T }).data;
}
