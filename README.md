<div align="center">

<h1 align="center">zpi-sdk</h1>

<p align="center"><b>Universal TypeScript SDK for the Zapi (Zest API) scraper platform.</b></p>

<div align="center">
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/v/zpi-sdk.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/zpi-sdk"><img src="https://img.shields.io/npm/dw/zpi-sdk?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zpi-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies"></a>
  <a href="https://github.com/zeative/zpi-sdk"><img src="https://img.shields.io/badge/runtime-Node%20%C2%B7%20Bun%20%C2%B7%20Deno%20%C2%B7%20Browser-informational" alt="Runtimes"></a>
</div>

<br>

<p align="center">
  Zero dependencies · Fully typed · Node, Bun, Deno & browser · Structured errors · Streaming · Bulk jobs · MCP
</p>

<p align="center">
  <a href="https://zpi.web.id/docs"><b>📖 Read the full documentation → zpi.web.id/docs</b></a>
</p>

</div>

---

## Install

```bash
npm i zpi-sdk      # or: pnpm add zpi-sdk  •  yarn add zpi-sdk  •  bun add zpi-sdk
```

Requires **Node.js v20+**. On Deno, import via `npm:zpi-sdk` — no install step.

## Quick start

Grab an API key from [zpi.web.id](https://zpi.web.id), then:

```ts
import { ZpiClient } from "zpi-sdk";

const client = new ZpiClient({ apiKey: "zpi_..." });

const data = await client.run("social:instagram", "profile", { username: "instagram" });
console.log(data);
```

Every failure throws a typed `ZpiError` subclass — catch and branch on the class:

```ts
import { ZpiError, ZpiRateLimitError } from "zpi-sdk";

try {
  await client.run("social:instagram", "profile", { username: "instagram" });
} catch (e) {
  if (e instanceof ZpiRateLimitError) console.log("retry after", e.retryAfterSec, "s");
  else if (e instanceof ZpiError) console.log(e.status, e.code, e.raw);
}
```

## What's in the box

| Feature | One-liner |
| --- | --- |
| `client.run()` | Single scraper call, typed errors, retries with backoff + idempotency |
| `client.stream()` | Async-iterable SSE/chunked streaming, works on every runtime |
| `client.bulk` | Submit many items, `job.wait()` with progress, duplicate-safe submits |
| `client.catalog` | Public discovery — list scrapers, schemas, categories, stats (no auth) |
| `npx zpi codegen` | Generate per-scraper types from the live catalog → `run()` autocompletes |
| `zpi-sdk/mcp` | Built-in MCP client for the remote `/mcp` server, still zero-dependency |

```ts
// streaming
for await (const event of client.stream("ai:chat", "completions", { prompt: "hi" })) {
  console.log(typeof event === "string" ? event : event.data);
}

// bulk
const job = await client.bulk.submit("social:instagram", "profile", [
  { url: "https://instagram.com/a" },
  { url: "https://instagram.com/b" },
]);
const result = await job.wait({ onProgress: (j) => console.log(j.succeeded, "/", j.total) });

// catalog (public)
const { items } = await client.catalog.list({ cat: "social", limit: 20 });
```

## Documentation

Everything — full API reference, configuration, error taxonomy, codegen, MCP, runtime notes — lives at:

### 👉 [zpi.web.id/docs](https://zpi.web.id/docs)

## Issues & feedback

Hit a problem or have a feature request? Open an [issue](https://github.com/zeative/zpi-sdk/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc) • [Ko-Fi](https://ko-fi.com/zaadevofc) • [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zpi-sdk/blob/main/LICENSE) for details.

<div align="left">
  <p>Copyright © 2026 zaadevofc. All rights reserved.</p>
</div>
