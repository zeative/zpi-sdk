---
"zpi-sdk": minor
---

Add `ttl` to `RunOpts` — request a cache max-age in seconds. Paid plans only; the server clamps it to your plan's floor and the endpoint's own cache lifetime, and returns `ZpiPlanGateError` on plans without one.
