# zpi-sdk

API-key-first TypeScript SDK for the Zapi (Zest API) scraper platform — call any
scraper end-to-end, single call or streaming, with full types and structured errors.

> Early development. This README is a placeholder; the full docs land in a later phase.

## Install

```sh
npm i zpi-sdk
```

## Features

- **run** — single scraper call (`client.run("category:scraper", "endpoint", params)`),
  unwrapped data, typed errors, retries, timeouts, abort.
- **stream** — async-iterable streaming for chunked / SSE endpoints.
- **catalog** — public, no-auth discovery: list scrapers, categories, endpoint schemas,
  stats.

## Account data

Account/usage reads (API keys, usage, request logs, rate-limit) are **out of v1 scope**.
They require **session auth** (better-auth) — not an API key — so an API-key-first SDK
cannot read them. Use the dashboard / frontend for account data instead.

See [`docs/account.md`](docs/account.md) for the full rationale and the future path.
