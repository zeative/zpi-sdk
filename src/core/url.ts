// Pure URL/query builders. The `:` in projectKey is path-legal and must survive verbatim,
// matching the BE param split (V1.ts) — so join by string, not URL path encoding.

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

export function buildUrl(
  baseURL: string,
  projectKey: string,
  endpoint: string,
  pathRest?: string
): string {
  const base = baseURL.replace(/\/+$/, "");
  let url = `${base}/v1/${projectKey}/${endpoint}`;
  if (pathRest) {
    const rest = trimSlashes(pathRest);
    if (rest) url += `/${rest}`;
  }
  return url;
}

export function appendQuery(
  url: string,
  params?: Record<string, unknown>
): string {
  if (!params) return url;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") continue; // drop nested objects/arrays
    sp.append(key, String(value));
  }
  const qs = sp.toString();
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}
