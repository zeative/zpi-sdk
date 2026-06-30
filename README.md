<div align="center">

<h1 align="center">zpi-sdk — Universal TypeScript SDK <br /> for the Zapi (Zest API) scraper platform</h1>

<br>

<div align="center">
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/v/zpi-sdk.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/dw/zpi-sdk?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zpi-sdk/releases"><img src="https://img.shields.io/npm/dt/zpi-sdk" alt="NPM Total Downloads"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/badge/TypeScript-7%20native-blue?style=flat-square&logo=typescript" alt="TypeScript 7"></a>
</div>

<div align="center">
  <a href="https://github.com/zeative/zpi-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/badge/runtime-Node%20%C2%B7%20Bun%20%C2%B7%20Deno%20%C2%B7%20Browser-informational" alt="Runtimes"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/github/stars/zeative/zpi-sdk" alt="GitHub Stars"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/github/forks/zeative/zpi-sdk" alt="GitHub Forks"></a>
</div>

<br>

<div align="center">
  <p>
    <b>zpi-sdk</b> is a universal, <b>zero-dependency</b>, API-key-first TypeScript client for the
    <b>Zapi (Zest API)</b> scraper platform. Construct a <code>ZpiClient</code>, then call any scraper
    end-to-end — single call, streaming, or bulk — with full types and a structured error hierarchy.
    Everything runs off a single injectable <code>fetch</code> seam, so the same build works on
    Node, Bun, Deno, and the browser.
  </p>
</div>

<div align="center">

[Quick start](#quick-start) &nbsp;•&nbsp;
[Install](#install) &nbsp;•&nbsp;
[run()](#run) &nbsp;•&nbsp;
[Streaming](#streaming) &nbsp;•&nbsp;
[Bulk](#bulk-jobs) &nbsp;•&nbsp;
[Catalog](#catalog-public-no-auth) &nbsp;•&nbsp;
[Codegen](#typed-codegen) &nbsp;•&nbsp;
[MCP](#mcp-client) &nbsp;•&nbsp;
[Errors](#error-handling) &nbsp;•&nbsp;
[Runtimes](#runtime-support)

</div>

</div>

<br>

---

## Quick start

```ts
import { ZpiClient } from "zpi-sdk";

const client = new ZpiClient({ apiKey: "zpi_..." });

// run() returns the UNWRAPPED `.data` from the BE envelope { project, data, timestamp }
const data = await client.run("social:instagram", "profile", { username: "instagram" });

console.log(data);
```

The default request method is **POST**. For GET endpoints pass `{ method: "GET" }`:

```ts
const data = await client.run("social:instagram", "profile", { username: "instagram" }, { method: "GET" });
```

## Install

```bash
npm i zpi-sdk      # or: pnpm add zpi-sdk  •  yarn add zpi-sdk  •  bun add zpi-sdk
```

Requires **Node.js v20+**. Deno needs no install step — import via the `npm:` specifier:

```ts
import { ZpiClient } from "npm:zpi-sdk";
```

Zero runtime dependencies, dual ESM/CJS with `.d.ts` + `.d.cts` types, and a `bin` (`zpi`) for codegen.

## Auth & configuration

The `apiKey` is sent on every request as the `x-api-key` header. Everything else is optional:

```ts
const client = new ZpiClient({
  apiKey: "zpi_...",
  baseURL: "https://api.zpi.web.id", // override the default base URL
  defaultHeaders: { "x-trace": "my-app" }, // merged into every request
  fetch: globalThis.fetch, // inject your own fetch (tests, proxies, edge runtimes)
  timeoutMs: 30_000, // per-request timeout
  maxRetries: 2, // retry budget for retryable failures
  baseRetryDelayMs: 250, // base backoff delay (exponential + jitter)
});
```

The full `run()` / `RunOpts` contract — method, timeout, abort, idempotency, and the retry taxonomy — is documented in [`docs/run-signature.md`](docs/run-signature.md).

## run()

A single scraper call. Wrap it in `try/catch` — every failure is an instance of `ZpiError` or a subclass:

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

`opts` (a `RunOpts`) lets you set `method`, `timeoutMs`, `signal`, `idempotencyKey`, extra `headers`, and `pathRest`. A POST is only retry-eligible when you pass an `idempotencyKey` (the same key is reused on every attempt).

## Streaming

For chunked / SSE endpoints, iterate the async iterable returned by `client.stream(...)`:

```ts
for await (const event of client.stream("ai:chat", "completions", { prompt: "hi" })) {
  // StreamEvent = SseEvent ({ event?, data, id? }) | string
  console.log(typeof event === "string" ? event : event.data);
}
```

Reads the response via `body.getReader()` (never the non-universal `for await...of response.body`), so it streams incrementally everywhere.

## Bulk jobs

Submit many items at once, then `wait()` for completion with optional progress reporting:

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

The submit auto-reuses an `Idempotency-Key`, so retried submits never create a duplicate job. You can also poll a known job directly with `client.bulk.status(jobId)`. `.wait()` honors `signal` / `timeoutMs`; a client-side timeout leaves the job running server-side.

## Catalog (public, no auth)

Discovery endpoints need no API key — `apiKey` is still required to construct the client, but catalog reads hit public routes:

```ts
const { items } = await client.catalog.list({ cat: "social", limit: 20 });
const detail = await client.catalog.get("social:instagram");
const categories = await client.catalog.categories();
const schema = await client.catalog.schema("social:instagram", "profile"); // { fields: [...] }
const stats = await client.catalog.stats("social:instagram"); // { requests, successRate }
```

## Typed codegen

`run()` is `unknown`-typed by default. Run the bundled CLI to generate per-scraper bindings from the **live** catalog — it fetches every scraper's endpoint schema and emits a `declare module "zpi-sdk"` block that narrows `run()`'s params:

```bash
npx zpi codegen                 # → ./zpi-sdk.gen.d.ts  (defaults to the public prod catalog)
npx zpi codegen --base http://localhost:4000 --out ./types/zpi.gen.d.ts --filter social
```

Include the generated `.d.ts` in your `tsconfig` and `run("social:instagram", "profile", …)` autocompletes its `params` per scraper. The output is **types-only** (zero runtime import); regenerate any time the catalog drifts. Unknown/loose schema fields degrade to `Record<string, unknown>` — never silent `any`. The endpoint `result` stays `unknown` (the backend exposes no result schema); override per call with `run<MyType>(…)`.

## MCP client

A built-in, isolated MCP **client** behind the `zpi-sdk/mcp` subpath. It speaks JSON-RPC over the remote `/mcp` Streamable-HTTP server — hand-rolled, so it stays **zero-dependency** (no `@modelcontextprotocol/sdk`):

```ts
import { createMcpClient } from "zpi-sdk/mcp";

const mcp = createMcpClient({ apiKey: "zpi_...", baseURL: "https://api.zpi.web.id" });

const tools = await mcp.listTools();           // handshake (initialize) runs lazily on first call
const result = await mcp.callTool("run_scraper", { /* tool args */ });
```

`listTools()` returns whatever the server exposes (not a hardcoded set); a JSON-RPC error throws a typed `ZpiMcpError` (with `code` / `data` / `raw`), and HTTP-level failures (401/429) map to the same `ZpiAuthError` / `ZpiRateLimitError` as the rest of the SDK. Both `application/json` and `text/event-stream` responses are handled. The `mcp` module never loads from the root entry, so the core stays lean.

## Error handling

Every failure throws a `ZpiError` (or a subclass). The base class carries `status`, `code?`, `raw` (the parsed BE body), and `requestId?`. Subclasses add typed fields:

| Class | When | Notable fields |
| --- | --- | --- |
| `ZpiAuthError` | Missing / invalid API key (401) | — |
| `ZpiPlanGateError` | Endpoint requires a higher plan (403) | `requiredPlan`, `upgradeUrl` |
| `ZpiRateLimitError` | Rate limit hit (429) | `limit`, `used`, `window`, `retryAfterSec` |
| `ZpiInvalidParamsError` | Params failed validation (400/422) | `errors[]` (`{ path?, message? }`) |
| `ZpiNotFoundError` | Scraper / endpoint not found (404) | — |
| `ZpiMethodNotAllowedError` | Wrong HTTP method (405) | — |
| `ZpiDisabledError` | Endpoint is disabled (503) | — |
| `ZpiExecError` | The scraper ran but failed | `error`, `errors`, `context`, `project` |
| `ZpiBulkNotEnabledError` | Bulk not enabled for this endpoint | — |
| `ZpiBulkCapError` | Bulk item count exceeds the cap | `cap`, `submitted` |
| `ZpiIdempotencyError` | Idempotency-Key conflict / reuse mismatch | — |
| `ZpiServerError` | Backend 5xx | — |
| `ZpiNetworkError` | Transport failure (no response) | `cause` |
| `ZpiTimeoutError` | Per-request timeout fired | `cause` |
| `ZpiAbortError` | External `signal` aborted the request | `cause` |
| `ZpiMcpError` | JSON-RPC error from `/mcp` (via `zpi-sdk/mcp`) | `code`, `data` |

Read `err.code` / `err.status` for branching, `err.raw` for the full body, and subclass fields (`requiredPlan` / `retryAfterSec` / `errors`) for specifics. These are camelCase on the JS object even though the wire format uses `required_plan` / `upgrade_url`. Only network errors and `429/502/503/504` are retried (exponential backoff + jitter); a POST is never blind-retried without an `idempotencyKey`. The API key is redacted from every thrown error, log, and snapshot.

## Runtime support

Built on a single injectable `fetch` seam with **zero node builtins**, so the same dist runs everywhere. Rows are honest about what was live-verified vs declared (`npm run verify:runtimes`):

| Runtime | Status | Verification |
| --- | --- | --- |
| Node `>=20` (tested v22) | ✅ live | ESM + CJS dist import, construct + `run()` via injected fetch |
| Bun | ✅ live | ESM dist import, construct + `run()` via injected fetch |
| Deno | ✅ live | `npm:` import, construct + `run()` via injected fetch |
| Browser | ✅ live (proxy) | no-node-globals load + construct (`process`/`Buffer` trapped) |
| Termux (Android) | 📋 declared | covered-by-Node path; `engines.node >=20` — not run here |

Package managers **npm**, **pnpm**, **yarn**, and **bun** are all supported.

## Account data

Account/usage reads (API keys, usage, request logs, rate-limit) are **session-only and out of SDK scope** — they require better-auth session cookies, not an API key. See [`docs/account.md`](docs/account.md) for the rationale and the future path.

## Documentation

- 📦 [`docs/run-signature.md`](docs/run-signature.md) — the frozen `run()` / `RunOpts` / `ScraperMap` contract
- 🔒 [`docs/account.md`](docs/account.md) — why account reads are out of scope
- 📝 `.changeset/` — pending release notes

## Issues & feedback

Hit a problem or have a feature request? Open an [issue](https://github.com/zeative/zpi-sdk/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc) • [Ko-Fi](https://ko-fi.com/zaadevofc) • [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zpi-sdk/blob/main/LICENSE) for details.

<div align="left">
  <p>Copyright © 2026 zaadevofc. All rights reserved.</p>
</div>
