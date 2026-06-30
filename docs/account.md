# Account & usage reads — out of `zpi-sdk` v1 scope (documented exclusion)

> **ACCT-01.** Account/usage reads (API keys, usage, request logs, rate-limit) are
> **intentionally not implemented** in `zpi-sdk` v1. This is a deliberate exclusion,
> not a missing feature. The reason is an auth-model mismatch, explained below.

## What is excluded

`zpi-sdk` v1 does **not** expose any of the following:

- list / read API keys
- usage summaries (daily/recent)
- request logs
- rate-limit status
- profile / whoami

In short: anything served under the backend's `/api/me/*` surface.

## Why — verified against `zpi-backend`

`zpi-sdk` is **API-key-first**: every call authenticates with an `x-api-key`. But the
account surface does not accept API keys.

Verified firsthand against `zpi-backend`:

- **Every** `/api/me/*` route is gated by `requireSession` — a better-auth **session**
  (browser cookie / session token), issued after an interactive login.
- Only `/v1` (scraper runs) and `/mcp` accept `requireApiKey`.
- There is **no** API-key-authenticated account / usage / whoami endpoint anywhere in
  the backend.

An API-key-first SDK therefore **cannot** read `/api/me/*` — there is no endpoint it is
allowed to call. Shipping account methods in v1 would mean shipping stubs that always
fail (no session), which is worse than an honest exclusion. Session auth stays in the
frontend, per the project's "API-key-first; session auth stays in FE" boundary.

## What to do instead

- **Read account data via the dashboard / frontend**, where the better-auth session
  exists. That is the supported path for keys, usage, logs, and rate-limit today.
- **Use the public catalog** (`catalog.*`) for non-account data — listing scrapers,
  categories, endpoint schemas, and stats. The catalog endpoints are public and need
  no session.

## Future path (cross-repo, needs sign-off)

If account reads are wanted **inside the SDK** later, the backend must first add an
API-key-authenticated read surface — for example `GET /v1/me` and `GET /v1/usage`
under `requireApiKey`. Only then can the SDK expose `client.me.*` honestly.

That is a **`zpi-backend` task requiring user sign-off**, tracked as a cross-repo
follow-up in `.planning/STATE.md` (Blockers/Concerns). It is out of Phase 3 scope.
