// Pure URL/query builders. The `:` in projectKey is path-legal and must survive verbatim,
// matching the BE param split (V1.ts) — so join by string, not URL path encoding.

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

// Forgiving endpoint parsing: users paste endpoints as "resolve", "/resolve",
// "resolve/:url", or "resolve/abc". First segment is the endpoint slug;
// `:param` placeholders are dropped (the BE fills path params from the params
// bag); literal extra segments become pathRest.
export function normalizeEndpoint(
  endpoint: string,
  pathRest?: string
): { slug: string; rest?: string } {
  const parts = trimSlashes(endpoint).split("/").filter(Boolean);
  const slug = parts[0] ?? "";
  const literals = parts.slice(1).filter((p) => !p.startsWith(":"));
  if (pathRest) {
    const extra = trimSlashes(pathRest);
    if (extra) literals.push(extra);
  }
  return { slug, rest: literals.length ? literals.join("/") : undefined };
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
