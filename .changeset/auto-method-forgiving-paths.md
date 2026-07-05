---
"zpi-sdk": minor
---

DX: auto HTTP method detection (405 flips GET↔POST once, learned verb memoized per endpoint) and forgiving endpoint paths — `:param` placeholders in the endpoint string are stripped (path params are plain fields in `params`), literal extra segments become `pathRest`.
