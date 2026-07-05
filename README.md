<div align="center">

<img alt="zpi-sdk - Universal TypeScript SDK for the Zapi (Zest API) scraper platform" src="https://zpi.web.id/favicon/web-app-manifest-192x192.png" width="90">

<h1 align="center">zpi-sdk — Universal TypeScript SDK <br /> for the Zapi (Zest API) Scraper Platform</h1>

<br>

<div align="center">
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/v/zpi-sdk.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/dw/zpi-sdk?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zpi-sdk/releases"><img src="https://img.shields.io/npm/dt/zpi-sdk" alt="NPM Downloads"></a>
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
    <a href="https://zpi.web.id">Zapi (Zest API)</a> scraper platform. Construct a <code>ZpiClient</code>,
    then call any scraper end-to-end — single call, streaming, or bulk — with full types and a structured
    error hierarchy. Everything runs off a single injectable <code>fetch</code> seam, so the same build
    works on Node, Bun, Deno, and the browser.
  </p>
</div>

<div align="center">

[Quick start](#quick-start) &nbsp;•&nbsp;
[Why zpi-sdk](#why-zpi-sdk) &nbsp;•&nbsp;
[Install](#install) &nbsp;•&nbsp;
[What you can build](#what-you-can-build) &nbsp;•&nbsp;
[Errors](#error-handling) &nbsp;•&nbsp;
[Runtimes](#runtime-support) &nbsp;•&nbsp;
[Docs](https://zpi.web.id/docs)

</div>

</div>

<br>

> [!NOTE]
> This README is a **high-level overview**. The complete API reference, guides, and recipes live in the documentation site at **<https://zpi.web.id/docs>**.

---

## Quick start

Grab an API key from [zpi.web.id](https://zpi.web.id), construct a client, and call any scraper — `run()` returns the unwrapped result data directly:

```typescript
import { ZpiClient } from 'zpi-sdk'

const client = new ZpiClient({ apiKey: 'zpi_...' })

const data = await client.run('social:instagram', 'profile', { username: 'instagram' })
console.log(data)
```

That is the whole integration. The default request method is **POST**; for GET endpoints pass `{ method: 'GET' }`:

```typescript
const data = await client.run('social:instagram', 'profile', { username: 'instagram' }, { method: 'GET' })
```

## Build with AI

zpi-sdk ships a built-in **MCP client** behind the `zpi-sdk/mcp` subpath, so AI agents can
discover and call every scraper as MCP tools. It speaks JSON-RPC over the remote `/mcp`
Streamable-HTTP server — hand-rolled, so it stays **zero-dependency**:

```typescript
import { createMcpClient } from 'zpi-sdk/mcp'

const mcp = createMcpClient({ apiKey: 'zpi_...' })

const tools = await mcp.listTools()           // handshake runs lazily on first call
const result = await mcp.callTool('run_scraper', { /* tool args */ })
```

The `mcp` module never loads from the root entry, so the core stays lean. See the full guide → **[zpi.web.id/docs](https://zpi.web.id/docs)**.

## Why zpi-sdk

- **Zero dependencies** — no runtime deps, no node builtins; one injectable `fetch` seam powers every runtime from Node to the browser.
- **One method, every scraper** — `client.run('social:instagram', 'profile', params)` covers the whole catalog; no per-scraper wrappers to learn.
- **Typed error hierarchy** — every failure is a `ZpiError` subclass (`ZpiRateLimitError`, `ZpiPlanGateError`, …) with typed fields like `retryAfterSec` and `upgradeUrl`. No status-code guessing.
- **Streaming out of the box** — `client.stream(…)` returns an async iterable of SSE events, reading via `body.getReader()` so it streams incrementally everywhere.
- **Bulk jobs** — submit many items, `job.wait()` with progress callbacks; submits auto-reuse an `Idempotency-Key`, so retries never create duplicate jobs.
- **Public catalog discovery** — list scrapers, categories, endpoint schemas, and stats without auth.
- **Typed codegen** — `npx zpi codegen` generates per-scraper bindings from the live catalog, narrowing `run()`'s params with full autocomplete.
- **Safe retries** — only network errors and `429/502/503/504` are retried (exponential backoff + jitter); a POST is never blind-retried without an `idempotencyKey`. API key redacted from every error and log.

## Install

```bash
npm i zpi-sdk      # or: pnpm add zpi-sdk  •  yarn add zpi-sdk  •  bun add zpi-sdk
```

Requires **Node.js v20+**. Deno needs no install step — import via the `npm:` specifier:

```typescript
import { ZpiClient } from 'npm:zpi-sdk'
```

Zero runtime dependencies, dual ESM/CJS with `.d.ts` + `.d.cts` types, and a `bin` (`zpi`) for codegen.

All configuration is optional beyond the API key:

```typescript
const client = new ZpiClient({
  apiKey: 'zpi_...',
  baseURL: 'https://api.zpi.web.id', // override the default base URL
  timeoutMs: 30_000,                 // per-request timeout
  maxRetries: 2,                     // retry budget for retryable failures
  fetch: globalThis.fetch,           // inject your own fetch (tests, proxies, edge runtimes)
})
```

## What you can build

### Run any scraper

```typescript
const profile = await client.run('social:instagram', 'profile', { username: 'instagram' })
const video = await client.run('downloader:tiktok', 'video', { url: 'https://tiktok.com/...' })
const gold = await client.run('finance:goldprice', 'latest', {})
```

### Streaming

For chunked / SSE endpoints, iterate the async iterable returned by `client.stream(...)`:

```typescript
for await (const event of client.stream('ai:chat', 'completions', { prompt: 'hi' })) {
  // StreamEvent = SseEvent ({ event?, data, id? }) | string
  console.log(typeof event === 'string' ? event : event.data)
}
```

### Bulk jobs

Submit many items at once, then `wait()` for completion with optional progress reporting:

```typescript
const job = await client.bulk.submit('social:instagram', 'profile', [
  { url: 'https://instagram.com/a' },
  { url: 'https://instagram.com/b' },
])

const result = await job.wait({
  onProgress: (j) => console.log(j.succeeded, '/', j.total),
})

for (const item of result.items ?? []) {
  console.log(item.status, item.data ?? item.error)
}
```

### Catalog discovery (public, no auth)

```typescript
const { items } = await client.catalog.list({ cat: 'social', limit: 20 })
const detail = await client.catalog.get('social:instagram')
const schema = await client.catalog.schema('social:instagram', 'profile')
const stats = await client.catalog.stats('social:instagram')
```

### Typed codegen

Generate per-scraper bindings from the **live** catalog — `run()`'s params become fully autocompleted:

```bash
npx zpi codegen                 # → ./zpi-sdk.gen.d.ts
npx zpi codegen --out ./types/zpi.gen.d.ts --filter social
```

The output is **types-only** (zero runtime import); regenerate any time the catalog drifts.

## Error handling

Every failure throws a `ZpiError` (or a subclass) carrying `status`, `code?`, `raw`, and `requestId?` — catch and branch on the class:

```typescript
import { ZpiClient, ZpiPlanGateError, ZpiRateLimitError, ZpiError } from 'zpi-sdk'

try {
  await client.run('social:instagram', 'profile', { username: 'instagram' })
} catch (e) {
  if (e instanceof ZpiPlanGateError) console.log('upgrade required:', e.requiredPlan, e.upgradeUrl)
  else if (e instanceof ZpiRateLimitError) console.log('retry after', e.retryAfterSec, 's')
  else if (e instanceof ZpiError) console.log('zpi error:', e.status, e.code, e.raw)
}
```

| Class | When | Notable fields |
| --- | --- | --- |
| `ZpiAuthError` | Missing / invalid API key (401) | — |
| `ZpiPlanGateError` | Endpoint requires a higher plan (403) | `requiredPlan`, `upgradeUrl` |
| `ZpiRateLimitError` | Rate limit hit (429) | `limit`, `used`, `window`, `retryAfterSec` |
| `ZpiInvalidParamsError` | Params failed validation (400/422) | `errors[]` |
| `ZpiExecError` | The scraper ran but failed | `error`, `errors`, `context` |
| `ZpiNetworkError` / `ZpiTimeoutError` / `ZpiAbortError` | Transport failure / timeout / abort | `cause` |
| `ZpiMcpError` | JSON-RPC error from `/mcp` | `code`, `data` |

> The full taxonomy (bulk, idempotency, 404/405/5xx classes) is documented at **[zpi.web.id/docs](https://zpi.web.id/docs)**.

## Runtime support

zpi-sdk ships dual ESM/CJS entry points with type declarations for both module systems, and is verified to load on:

| Runtime | ESM | CJS |
| ------- | --- | --- |
| Node.js `>=20` | ✅ | ✅ |
| Bun | ✅ | ✅ |
| Deno (`npm:` specifier) | ✅ | ✅ |
| Browser | ✅ | — |

Package managers: **npm**, **pnpm**, **yarn**, and **bun** are all supported.

## Documentation

- 🌐 [**zpi.web.id/docs**](https://zpi.web.id/docs) — full documentation site: guides, API reference, recipes
- 🧭 [**zpi.web.id/apis**](https://zpi.web.id/apis) — browse the live scraper catalog
- 🤖 [**MCP client**](https://zpi.web.id/docs) — wire every scraper into your AI agent as MCP tools
- 📝 [**Changesets**](./.changeset) — pending release notes

## Issues & feedback

Hit a problem or have a feature request? Open an [issue](https://github.com/zeative/zpi-sdk/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc) • [Ko-Fi](https://ko-fi.com/zaadevofc) • [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zpi-sdk/blob/main/LICENSE) for details.

<div align="left">
  <p>
    <img alt="zpi-sdk" src="https://zpi.web.id/favicon/web-app-manifest-192x192.png" width="20" align="center">
    Copyright © 2026 zaadevofc. All rights reserved.
  </p>
</div>
