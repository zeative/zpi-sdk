# `run()` / `ScraperMap` — FROZEN signature (codegen emit target, DX-03)

> This is the **codegen (Phase 6) emit target**. It is frozen. Do **not** change it
> without a **major version bump** — generated code and consumer types both depend on
> this exact shape. Additive `declare module` merging into `ScraperMap` is allowed and
> is the intended extension mechanism.

## Signature

```ts
client.run<T = unknown>(
  projectKey: string,        // "category:scraper" (preferred) or bare "scraper" (legacy)
  endpoint: string,          // endpoint slug
  params?: Record<string, unknown>, // merged into query (GET) or JSON body (POST)
  opts?: RunOpts
): Promise<T>;
```

Returns the **unwrapped** `data` from the BE envelope `{ project, data, timestamp }`
(i.e. only `.data`). Typed `unknown` by default; narrowed via `ScraperMap` when codegen
has emitted entries.

## `opts` shape (`RunOpts`) — FROZEN

```ts
interface RunOpts {
  method?: "GET" | "POST";        // default GET
  signal?: AbortSignal;           // composed with the per-request timeout (abort if EITHER fires)
  timeoutMs?: number;             // per-request; falls back to client timeoutMs
  idempotencyKey?: string;        // REQUIRED to make a failing POST retry-eligible; reused across attempts
  headers?: Record<string, string>;
  pathRest?: string;              // extra path segments appended after /v1/{projectKey}/{endpoint}
}
```

## DX behaviors (additive — signature unchanged)

- **Auto method**: when `opts.method` is omitted the call goes out as **GET** — 175 of
  the catalog's 181 endpoints are GET. If the BE answers 405 it names the verb it wants
  (`content.expected`, plus the RFC 9110 `Allow` header); the SDK adopts that verb, retries
  once, and memoizes it per `projectKey/endpoint`. The memo is **process-wide**, so
  per-request client construction (serverless) does not re-pay the correction; pass
  `methodMemo` in the client options to opt out. Explicit `opts.method` disables all of it.
- **Zero-probe mode**: `client.useMethods(ZPI_METHODS)` seeds the memo from codegen's
  baked verb table, and `catalog.get(slug)` seeds it as a side effect of a read you were
  already doing. Either way no call ever has to discover its verb.
- **Forgiving endpoint**: `endpoint` may contain extra segments — `":param"`
  placeholders are stripped (the BE fills path params from `params`), literal
  segments become `pathRest`. `"resolve"`, `"resolve/:url"`, `"/resolve/"` are
  all equivalent.

## Method / retry / timeout contract

- Default method is **GET** (subject to auto-method above). GET is also the safe direction
  to be wrong in: a GET→POST correction moves params into a JSON body intact, whereas
  POST→GET has to flatten them into a query string.
- **Timeout**: per-request `timeoutMs` via `new AbortController()` + `setTimeout` (never
  `AbortSignal.timeout`), composed with the external `opts.signal`. Timeout → `ZpiTimeoutError`;
  external abort → `ZpiAbortError`; raw network failure → `ZpiNetworkError` (with `.cause`).
- **Retry** (taxonomy frozen, CORE-07): retry only network errors + `429/502/503/504`,
  with exponential backoff + jitter capped at `maxRetries`. Honors `Retry-After` header and
  the 429 body `content.retryAfterSec`. Never retries other 4xx. Never blind-retries a POST
  unless `idempotencyKey` is set (the same key is reused on every attempt as `Idempotency-Key`).
  A 405 verb correction is **not** charged to `maxRetries`.

## `ScraperMap` declaration-merge contract

`ScraperMap` is an **empty interface** by default → `run()` falls back to `unknown`.
Codegen merges concrete entries via `declare module`:

```ts
declare module "zpi-sdk" {
  interface ScraperMap {
    "social:instagram": {
      profile: { params: { username: string }; result: { id: string; name: string } };
    };
  }
}
```

Shape per entry: `{ [`${category}:${scraper}`]: { [endpoint]: { params; result } } }`.

The exported helper `ScraperResult<K, E>` resolves to `ScraperMap[K][E]["result"]` when a
matching entry exists, and to `unknown` otherwise — this is what narrows `run()`'s return
type once generated types are present, with a safe `unknown` fallback when they are not.
