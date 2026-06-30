---
"zpi-sdk": minor
---

Initial public release (v0.1.0) of `zpi-sdk` — a universal, zero-dependency TypeScript SDK for the Zest API (Zapi) scraper platform.

This first cut ships the full client surface:

- **Typed `run()`** over a single injectable `fetch` seam — one call returns parsed, typed results for any scraper endpoint.
- **Full `ZpiError` hierarchy** — structured errors (`AuthError`, `PlanError`, `RateLimitError`, `ValidationError`, `TimeoutError`, …) carrying `code`, `requiredPlan`, and `raw` for precise `try/catch` handling.
- **`runStream()` async-iterable streaming** — `for await` over Server-Sent-Event chunks with the same typed error model.
- **No-auth `catalog.*` discovery** — list scrapers and read endpoint schemas without an API key.
- **`bulk.submit().wait()`** — fire-and-poll bulk jobs with idempotency keys and `onProgress` callbacks.
- **Verified universal-runtime matrix** — live-verified on Node, Bun, Deno, and a browser-proxy (zero node-builtins, single fetch seam); Termux declared as covered-by-Node (`engines.node >= 20`).
