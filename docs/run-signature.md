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
  method?: "GET" | "POST";        // default POST
  signal?: AbortSignal;           // composed with the per-request timeout (abort if EITHER fires)
  timeoutMs?: number;             // per-request; falls back to client timeoutMs
  idempotencyKey?: string;        // REQUIRED to make a failing POST retry-eligible; reused across attempts
  headers?: Record<string, string>;
  pathRest?: string;              // extra path segments appended after /v1/{projectKey}/{endpoint}
}
```

## Method / retry / timeout contract

- Default method is **POST**.
- **Timeout**: per-request `timeoutMs` via `new AbortController()` + `setTimeout` (never
  `AbortSignal.timeout`), composed with the external `opts.signal`. Timeout → `ZpiTimeoutError`;
  external abort → `ZpiAbortError`; raw network failure → `ZpiNetworkError` (with `.cause`).
- **Retry** (taxonomy frozen, CORE-07): retry only network errors + `429/502/503/504`,
  with exponential backoff + jitter capped at `maxRetries`. Honors `Retry-After` header and
  the 429 body `content.retryAfterSec`. Never retries other 4xx. Never blind-retries a POST
  unless `idempotencyKey` is set (the same key is reused on every attempt as `Idempotency-Key`).

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
