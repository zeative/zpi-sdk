# zpi-sdk

## 0.2.0

### Minor Changes

- New `zpi-sdk/webhooks` subpath: `verifyWebhook` (timing-safe HMAC-SHA256 check of `X-Zpi-Signature` via Web Crypto — Node/Bun/Deno/edge) and `parseWebhook` (verify + typed `{ id, event, data, deliveredAt }` envelope, throws `ZpiWebhookVerifyError` on bad signature). Ships the full event-name union (`bulk.completed`, `quota.warning`, …).

## 0.1.2

### Patch Changes

- README: breathing room around the header logo.

## 0.1.1

### Patch Changes

- `VERSION` export now reports the real package version (was stuck at 0.0.0).

## 0.1.0

### Minor Changes

- 3a951fc: DX: auto HTTP method detection (405 flips GET↔POST once, learned verb memoized per endpoint) and forgiving endpoint paths — `:param` placeholders in the endpoint string are stripped (path params are plain fields in `params`), literal extra segments become `pathRest`.
- 91276b9: Initial public release (v0.1.0) of `zpi-sdk` — a universal, zero-dependency TypeScript SDK for the Zest API (Zapi) scraper platform.

  This first cut ships the full client surface:

  - **Typed `run()`** over a single injectable `fetch` seam — one call returns parsed, typed results for any scraper endpoint.
  - **Full `ZpiError` hierarchy** — structured errors (`AuthError`, `PlanError`, `RateLimitError`, `ValidationError`, `TimeoutError`, …) carrying `code`, `requiredPlan`, and `raw` for precise `try/catch` handling.
  - **`runStream()` async-iterable streaming** — `for await` over Server-Sent-Event chunks with the same typed error model.
  - **No-auth `catalog.*` discovery** — list scrapers and read endpoint schemas without an API key.
  - **`bulk.submit().wait()`** — fire-and-poll bulk jobs with idempotency keys and `onProgress` callbacks.
  - **Verified universal-runtime matrix** — live-verified on Node, Bun, Deno, and a browser-proxy (zero node-builtins, single fetch seam); Termux declared as covered-by-Node (`engines.node >= 20`).

- 692382d: Codegen types are now enforced: `run()`/`stream()` infer `projectKey`/`endpoint` literals and narrow `params` via `ScraperMap` (new `ScraperParams` helper exported). Codegen output fixed: `export {}` makes the generated file a module augmentation instead of shadowing the package types, hyphenated slugs/field names are quoted, and `*/` in descriptions is escaped.

### Patch Changes

- e8e1612: catalog.get/schema/stats accept the `"category:scraper"` project key form (category prefix is stripped — public catalog routes key on the bare slug).
- f068e35: Add the `./mcp` subpath entry: `createMcpClient` (lazy initialize handshake + generic listTools/callTool over hand-rolled JSON-RPC-over-fetch) plus the typed `ZpiMcpError`. Zero new runtime deps. Also widen `ZpiError.code` to `string | number` so JSON-RPC numeric codes fit the shared hierarchy (backward-compatible superset). The `.` root type surface is unchanged (same 43 exports); only the dts emit layout was refreshed since `./mcp` now shares `core/errors`.
