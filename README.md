# zpi-sdk

Universal, zero-dependency, API-key-first TypeScript SDK for the
**Zapi (Zest API)** scraper platform. Call any scraper end-to-end — single
call, streaming, or bulk — with full types and a structured error hierarchy.
Runs on Node, Bun, Deno, and the browser off a single `fetch` seam.

## Install

```sh
npm i zpi-sdk
```

```sh
bun add zpi-sdk
```

Deno (no install step — import via the `npm:` specifier):

```ts
import { ZpiClient } from "npm:zpi-sdk";
```

## Quickstart

```ts
import { ZpiClient } from "zpi-sdk";

const client = new ZpiClient({ apiKey: "zpi_..." });

// run() returns the UNWRAPPED `.data` from the BE envelope { project, data, timestamp }
const data = await client.run("social:instagram", "profile", {
  username: "instagram",
});

console.log(data);
```

The default request method is **POST**. For GET endpoints pass `{ method: "GET" }`:

```ts
const data = await client.run("social:instagram", "profile", { username: "instagram" }, { method: "GET" });
```

## Auth & configuration

The `apiKey` is sent on every request as the `x-api-key` header. Everything
else is optional:

```ts
const client = new ZpiClient({
  apiKey: "zpi_...",
  baseURL: "https://api.zpi.web.id", // override the default base URL
  defaultHeaders: { "x-trace": "my-app" }, // merged into every request
  fetch: globalThis.fetch, // inject your own fetch (tests, proxies, edge runtimes)
  timeoutMs: 30_000, // per-request timeout (default applies if omitted)
  maxRetries: 2, // retry budget for retryable failures
  baseRetryDelayMs: 250, // base backoff delay (exponential + jitter)
});
```

The full `run()` / `RunOpts` contract — method, timeout, abort, idempotency,
and the retry taxonomy — is documented in
[`docs/run-signature.md`](docs/run-signature.md).

## run()

A single scraper call. Wrap it in `try/catch` to handle typed errors — every
failure is an instance of `ZpiError` or one of its subclasses:

```ts
import { ZpiClient, ZpiPlanGateError, ZpiRateLimitError, ZpiError } from "zpi-sdk";

const client = new ZpiClient({ apiKey: "zpi_..." });

try {
  const data = await client.run("social:instagram", "profile", { username: "instagram" });
  console.log(data);
} catch (e) {
  if (e instanceof ZpiPlanGateError) {
    console.log("upgrade required:", e.requiredPlan, e.upgradeUrl);
  } else if (e instanceof ZpiRateLimitError) {
    console.log("slow down, retry after", e.retryAfterSec, "s");
  } else if (e instanceof ZpiError) {
    console.log("zpi error:", e.status, e.code, e.raw);
  }
}
```

`opts` (a `RunOpts`) lets you set `method`, `timeoutMs`, `signal`,
`idempotencyKey`, extra `headers`, and `pathRest`. Note: a POST is only
retry-eligible when you pass an `idempotencyKey` (the same key is reused on
every attempt).

## Streaming

For chunked / SSE endpoints, iterate the async iterable returned by
`client.stream(...)`:

```ts
for await (const event of client.stream("ai:chat", "completions", { prompt: "hi" })) {
  // StreamEvent = SseEvent ({ event?, data, id? }) | string
  console.log(typeof event === "string" ? event : event.data);
}
```

Endpoints marked SKIP-STREAM on the platform don't stream — use `run()` for
those.

## Bulk jobs

Submit many items at once, then `wait()` for completion with optional progress
reporting:

```ts
const job = await client.bulk.submit("social:instagram", "profile", [
  { url: "https://instagram.com/a" },
  { url: "https://instagram.com/b" },
]);

const result = await job.wait({
  onProgress: (j) => console.log(j.succeeded, "/", j.total),
});

for (const item of result.items ?? []) {
  console.log(item.status, item.data ?? item.error);
}
```

The submit auto-reuses an `Idempotency-Key`, so retried submits never create a
duplicate job. You can also poll a known job directly with
`client.bulk.status(jobId)`.

## Catalog (public, no auth)

Discovery endpoints need no API key — `apiKey` is still required to construct
the client, but catalog reads hit public routes:

```ts
const { items } = await client.catalog.list({ cat: "social", limit: 20 });
const detail = await client.catalog.get("social:instagram");
const categories = await client.catalog.categories();
const schema = await client.catalog.schema("social:instagram", "profile");
const stats = await client.catalog.stats("social:instagram"); // { requests, successRate }
```

## Error handling

Every failure throws a `ZpiError` (or a subclass). The base class carries
`status`, `code?`, `raw` (the parsed BE body), and `requestId?`. Subclasses add
typed fields:

| Class | When | Notable fields |
| --- | --- | --- |
| `ZpiAuthError` | Missing / invalid API key (401) | — |
| `ZpiPlanGateError` | Endpoint requires a higher plan (402/403) | `requiredPlan`, `upgradeUrl` |
| `ZpiRateLimitError` | Rate limit hit (429) | `limit`, `used`, `window`, `retryAfterSec` |
| `ZpiInvalidParamsError` | Request params failed validation (400/422) | `errors[]` (`{ path?, message? }`) |
| `ZpiNotFoundError` | Scraper / endpoint not found (404) | — |
| `ZpiMethodNotAllowedError` | Wrong HTTP method for the endpoint (405) | — |
| `ZpiDisabledError` | Endpoint is disabled | — |
| `ZpiExecError` | The scraper ran but failed | `error`, `errors`, `context`, `project` |
| `ZpiBulkNotEnabledError` | Bulk not enabled for this endpoint | — |
| `ZpiBulkCapError` | Bulk item count exceeds the cap | `cap`, `submitted` |
| `ZpiIdempotencyError` | Idempotency-Key conflict / reuse mismatch | — |
| `ZpiServerError` | Backend 5xx | — |
| `ZpiNetworkError` | Transport failure (no response) | `cause` |
| `ZpiTimeoutError` | Per-request timeout fired | `cause` |
| `ZpiAbortError` | External `signal` aborted the request | `cause` |

Read `err.code` and `err.status` for branching, `err.raw` for the full body,
and subclass fields (`requiredPlan` / `upgradeUrl` / `retryAfterSec` /
`errors`) for specifics. Note these are camelCase on the JS object even though
the wire format uses `required_plan` / `upgrade_url`.

Retry, timeout, and abort knobs (`maxRetries`, `baseRetryDelayMs`, `timeoutMs`,
`signal`, `idempotencyKey`) are covered in full in
[`docs/run-signature.md`](docs/run-signature.md). In short: only network errors
and `429/502/503/504` are retried with exponential backoff + jitter; a POST is
never blind-retried without an `idempotencyKey`.

## Runtime support

Built on a single injectable `fetch` seam with **zero node builtins**, so the
same dist runs everywhere. Rows are honest about what was live-verified vs
declared (see plan 05-01 `verify:runtimes`):

| Runtime | Version | Status | Verification |
| --- | --- | --- | --- |
| Node | >=20 (tested v22.22.3) | ✅ live | ESM + CJS dist import, construct + `run()` via injected fetch |
| Bun | 1.3.11 | ✅ live | ESM dist import, construct + `run()` via injected fetch |
| Deno | 2.7.14 | ✅ live | `npm:` import, construct + `run()` via injected fetch |
| Browser | — | ✅ live (proxy) | no-node-globals load + construct (`process`/`Buffer` trapped) |
| Termux | Android (Node) | 📋 declared | covered-by-Node path; `engines.node >=20` — not run here |

Node, Bun, Deno, and the browser proxy were live-verified against the built
dist. Termux is declared (functionally identical to the Node path), not a fake
tested row.

## Account data

Account/usage reads (API keys, usage, request logs, rate-limit) are
**session-only and out of SDK scope** — they require better-auth session cookies,
not an API key. See [`docs/account.md`](docs/account.md) for the rationale and
the future path.

## Coming next

Planned for upcoming releases (not yet shipped — do not depend on these APIs):

- **`zpi codegen`** — generate typed bindings (`ScraperMap`) so `run()` narrows
  its params and result per scraper.
- **Built-in MCP client** — drive scrapers from MCP-aware tools.

## License

MIT © zaadevofc. See [`LICENSE`](LICENSE).
