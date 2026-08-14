# zpi-sdk

## 0.5.0

### Minor Changes

- `zpi codegen --scan <dir>` emits only the scrapers your code actually calls.

  Generating the whole catalog produced a 160 KB declaration file for projects using two endpoints.
  `--scan` reads the source for `run("category:scraper", "endpoint")` / `stream(…)` calls with literal
  arguments and keeps just those — 600 bytes for the same project.

  Calls that cannot be resolved statically (a variable endpoint, a computed key) are not emitted, and
  scraper keys the catalog does not know are reported so a typo does not fail silently. The generated
  header now records the exact command, so a scanned file is never regenerated as the full catalog by
  accident.

## 0.4.0

### Minor Changes

- beff2ec: Add `ttl` to `RunOpts` — request a cache max-age in seconds. Paid plans only; the server clamps it to your plan's floor and the endpoint's own cache lifetime, and returns `ZpiPlanGateError` on plans without one.
- `run()` now infers its result from `ScraperMap` instead of returning `unknown`.

  `ScraperResult<K, E>` existed and was exported but never reached `run`, so codegen could
  narrow params while every result stayed `unknown`. `run`'s type parameters are reordered to
  `<K, E, T = ScraperResult<K, E>>` — a default may only reference parameters declared before
  it, so `T` has to come last.

  **Breaking:** `client.run<MyShape>(…)` no longer compiles, because `MyShape` binds to `K`
  (constrained to `string`). Annotate the variable instead:

  ```ts
  const data: MyShape = await client.run("category:scraper", "endpoint");
  ```

## 0.3.0

### Minor Changes

- Stop the 405 probe. `run()` and `stream()` now default to **GET** instead of POST — 175 of the catalog's 181 endpoints are GET, so the old default made ~97% of cold calls spend a wasted 405 round trip before correcting themselves. On the API side those throwaway 405s were charged to your monthly quota, consumed rate-limit budget, inflated endpoint request counts, and fired a `request.error` webhook; the backend no longer does any of that, and now accepts either verb on a read-only endpoint.

  - **GET by default**, and it is the safe direction to be wrong in: a GET→POST correction moves params into a JSON body intact, where POST→GET had to flatten them into a query string.
  - **405s are resolved from what the server said** — `content.expected`, else the RFC 9110 `Allow` header — instead of blind-toggling GET↔POST. A verb the SDK cannot speak (`PUT`, …) now surfaces the error instead of burning a second request on a guess.
  - **The learned-verb memo is process-wide**, not per client. Under serverless / per-request client construction it never warmed before, so every single call re-paid the correction. Pass `methodMemo` in the client options to opt out.
  - **`client.useMethods(ZPI_METHODS)`** adopts codegen's baked verb table, and `catalog.get(slug)` seeds the memo as a side effect of a read you were already doing — either way no call has to discover its verb.
  - **Codegen emits `ZPI_METHODS`**, a runtime map of every endpoint's declared verb, alongside the existing `ScraperMap` type augmentation.
  - **`ZpiMethodNotAllowedError.expected`** exposes the verb the endpoint wants, so a hard 405 is actionable without parsing `.message`.
  - **`appendQuery` no longer silently drops object/array params.** They were deleted from a GET with no error and the request "succeeded" with missing input; they are now JSON-encoded.
  - A 405 verb correction no longer spends an attempt from `maxRetries`, and the stream path no longer leaks the 405 response body before re-fetching.

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
