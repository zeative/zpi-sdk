# Implementation Plan: Kill the 405 probe

## Context

Users report frequent `405 Method Not Allowed` on endpoints that are declared `GET`.

**Root cause.** `zpi-sdk` defaults every `run()`/`stream()` call to **POST**
(`src/resources/exec.ts:58`, `src/core/http.ts:87`). The live catalog is
**175 GET / 6 POST out of 181 endpoints (96.7% GET)**. So ~97% of "cold" calls
send the wrong verb, take a 405, then flip to GET and retry
(`src/core/http.ts:102-109`). The user sees a working result, so the bug is
invisible from the client side.

It is not invisible on the server side. `EndpointExecService.ts:776-789` calls
`logRequest({ status: 405, errorCode: "method_not_allowed", endpointId })`, and
that single call does four damaging things:

| Effect | Where | Consequence |
|---|---|---|
| Writes a billable `RequestLog` row | `BILLABLE_REQUEST_FILTER = { status: { lt: 500 } }` (`UsageService.ts:15`) | **405 is charged to the user's monthly quota.** Effective quota halved. |
| Consumes a per-minute rate-limit slot | `enforceRateLimit` runs before dispatch (`V1.ts:18`); the minute throttle counts *all* rows | Effective RPM halved. |
| `endpoint.requestCount++` | `request-log.utils.ts:121-135` | Public catalog request counts inflated ~2×. |
| Fires a `request.error` webhook | `request-log.utils.ts:142-148` | Every cold SDK call sends the user a phantom error webhook. |

Plus `/api/public/scrapers/:slug/stats` computes `successRate` from
`status < 400` (`routes/index.ts:216`) — so the probe drags the **publicly
displayed success rate** down.

`methodMemo` is a fresh `Map` per `resolveConfig` (`core/config.ts:40`), i.e.
per `ZpiClient`. In serverless / per-request client construction the memo never
warms, so **every** call pays the 405 — which is exactly the "sering kena 405"
report.

**Intended outcome.** No user is ever billed, throttled, or webhook-spammed for
an HTTP verb the SDK picked on their behalf; and the SDK stops picking the wrong
one.

## Architecture Decisions

1. **Backend first, SDK second.** SDK 0.1.x–0.2.0 is already in the wild and
   cannot be recalled. Only a backend change fixes those users today. The SDK
   change removes the wasted round trip; the backend change removes the harm.

2. **Read-only endpoints accept either verb.** `V1.ts:59` already builds
   `input = { ...query, ...body }` regardless of method, and
   `EndpointExecService.ts:795` already states *"scrapes are read-only
   regardless of transport"*. Enforcement is therefore a formality for
   `GET`/`POST`. Accepting both makes 405 unreachable on the SDK path. 405 is
   retained for genuinely mutating verbs (`PUT`/`PATCH`/`DELETE`) so the
   escape hatch survives.

3. **A 405 is never the caller's fault in a way worth charging for.** Even for
   the retained cases, the row stays in `RequestLog` for transparency but is
   excluded from billing, from the endpoint counter, from public success rate,
   and from the `request.error` webhook.

4. **The SDK stops guessing and starts reading.** Default `GET` (matches 96.7%
   of the catalog), and honour the server's `content.expected` / `Allow` header
   on 405 instead of blind-toggling. Blind toggle also can't reach a third verb.

5. **GET-first is the safe flip direction.** `appendQuery` drops
   object/array values (`core/url.ts:49`). A POST→GET flip therefore *silently
   loses* nested params; a GET→POST flip carries the full body. Defaulting to
   GET inverts the lossy direction. The drop itself is fixed separately.

6. **Learned verbs are process-wide, not client-wide.** A module-level default
   `Map` (overridable per client) survives per-request client construction.

## Task List

### Phase 1: Backend — stop the harm (ships without an SDK release)

- [ ] **Task 1: Accept GET↔POST on read-only endpoints**
- [ ] **Task 2: Make the remaining 405s non-billable and non-noisy**
- [ ] **Task 3: Exclude `method_not_allowed` from public `successRate`**

### Checkpoint: Backend
- [ ] `bun test` green in `zpi-backend`
- [ ] `EndpointExecService.test.ts` method-parity suite updated and passing
- [ ] A POST to a GET-declared endpoint returns 200, not 405

### Phase 2: SDK — stop sending the wrong verb

- [ ] **Task 4: Default to GET; resolve 405 from `content.expected` / `Allow`**
- [ ] **Task 5: Share `methodMemo` process-wide; seed it from the catalog**
- [ ] **Task 6: Codegen bakes the per-endpoint verb into the generated module**

### Checkpoint: SDK core
- [ ] `bun test` green in `zpi-sdk`
- [ ] `test/dx.test.ts` asserts GET-first and `expected`-driven resolution
- [ ] `bun run build` + size-limit pass

### Phase 3: SDK — the three bugs on the same path

- [ ] **Task 7: `appendQuery` must not silently drop object/array params**
- [ ] **Task 8: `ZpiMethodNotAllowedError.expected`**
- [ ] **Task 9: Flip must not consume a retry attempt; stream must not leak the 405 body**

### Checkpoint: Complete
- [ ] Full suite green, dist builtin-scan clean, runtime smokes pass
- [ ] Changeset written, version bumped, published to npm

---

## Task 1: Accept GET↔POST on read-only endpoints

**Description:** Method enforcement in the exec seam currently rejects any verb
that differs from the endpoint's declared one. Since the dispatch layer already
merges query and body into one `input` bag and scrapes are read-only, `GET` and
`POST` are interchangeable in practice. Treat them as such; keep 405 for
mutating verbs.

**Acceptance criteria:**
- [ ] A `GET`-declared endpoint called with `POST` (JSON body) executes and returns 200
- [ ] A `POST`-declared endpoint called with `GET` (query string) executes and returns 200
- [ ] `PUT`/`PATCH`/`DELETE` against any endpoint still returns 405 with `expected`

**Verification:**
- [ ] `bun test src/services/EndpointExecService.test.ts`
- [ ] Manual: `curl -X POST -H 'content-type: application/json' -d '{"q":"test"}' /v1/search:google/web` → 200

**Dependencies:** None
**Files:** `src/services/EndpointExecService.ts`, `src/services/EndpointExecService.test.ts`
**Scope:** Small

## Task 2: Make the remaining 405s non-billable and non-noisy

**Description:** A method mismatch performs no scraping work. Keep the log row
for transparency, but exclude it from the monthly quota, from the denormalized
endpoint counter, and from the `request.error` webhook. Add the RFC 9110
`Allow` header so any HTTP client can self-correct.

**Acceptance criteria:**
- [ ] `BILLABLE_REQUEST_FILTER` excludes `errorCode: "method_not_allowed"`
- [ ] A 405 does not increment `endpoint.requestCount`
- [ ] A 405 does not dispatch `request.error`
- [ ] The 405 response carries `Allow: <expected>`

**Verification:**
- [ ] `bun test` (usage + request-log suites)
- [ ] Manual: `curl -i -X DELETE …` shows `Allow:` and leaves quota unchanged

**Dependencies:** None (independent of Task 1)
**Files:** `src/services/UsageService.ts`, `src/utils/request-log.utils.ts`, `src/services/EndpointExecService.ts`, `src/routes/V1.ts`
**Scope:** Small

## Task 3: Exclude `method_not_allowed` from public `successRate`

**Description:** The public stats route counts every `RequestLog` row with
`status < 400` as a success. Historical 405 probe rows currently depress the
number shown on every catalog page.

**Acceptance criteria:**
- [ ] `/api/public/scrapers/:slug/stats` ignores `errorCode: "method_not_allowed"` rows

**Verification:**
- [ ] `curl /api/public/scrapers/google/stats` before/after — rate rises to reflect real failures only

**Dependencies:** None
**Files:** `src/routes/index.ts`
**Scope:** XS

## Task 4: Default to GET; resolve 405 from `content.expected` / `Allow`

**Description:** Flip the SDK's default verb from POST to GET, and replace the
blind GET↔POST toggle with a read of the server's stated expectation.

**Acceptance criteria:**
- [ ] `run()`/`stream()` with no explicit `method` send `GET`
- [ ] A 405 carrying `content.expected: "POST"` retries as POST, not as a toggle
- [ ] A 405 carrying `Allow: PUT` retries as PUT
- [ ] An explicit `opts.method` is still never overridden

**Verification:**
- [ ] `bun test test/dx.test.ts test/retry.test.ts test/stream.test.ts`

**Dependencies:** None
**Files:** `src/core/http.ts`, `src/resources/exec.ts`, `src/resources/stream.ts`
**Scope:** Medium

## Task 5: Share `methodMemo` process-wide; seed it from the catalog

**Description:** The memo is per-client, so serverless never warms it. Back it
with a module-level default `Map` (overridable per client for test isolation),
and populate it for free whenever `catalog.get()` runs — that response already
carries `endpoints[].method`.

**Acceptance criteria:**
- [ ] Two `ZpiClient`s in one process share learned verbs by default
- [ ] Passing `methodMemo` in options opts out of the shared map
- [ ] `await client.catalog.get(slug)` populates the memo for that scraper's endpoints
- [ ] No apiKey or user data is stored in the shared map

**Verification:**
- [ ] `bun test test/dx.test.ts test/catalog.test.ts`

**Dependencies:** Task 4
**Files:** `src/core/config.ts`, `src/resources/catalog.ts`, `src/client.ts`
**Scope:** Medium

## Task 6: Codegen bakes the per-endpoint verb into the generated module

**Description:** `generate()` already fetches `detail.endpoints[].method` and
discards it (`src/codegen.ts:124`). Emit it as a runtime map alongside the type
augmentation, and let a client adopt it so typed users never probe at all.

**Acceptance criteria:**
- [ ] Generated file exports `ZPI_METHODS` keyed `"category:scraper" → { endpoint: verb }`
- [ ] The file remains a module *augmentation* (a top-level export is present)
- [ ] `client.useMethods(ZPI_METHODS)` seeds the memo; a seeded endpoint issues exactly one request
- [ ] Output stays deterministic (sorted) for drift detection

**Verification:**
- [ ] `bun test test/codegen.emit.test.ts test/codegen.generate.test.ts`

**Dependencies:** Task 5
**Files:** `src/codegen/emit.ts`, `src/codegen.ts`, `src/client.ts`
**Scope:** Medium

## Task 7: `appendQuery` must not silently drop object/array params

**Description:** `core/url.ts:49` skips any value whose `typeof` is `"object"`.
On a GET the caller's array/object param vanishes with no error, and the request
"succeeds" with missing input. Encode instead of dropping.

**Acceptance criteria:**
- [ ] An array/object param survives a GET as a JSON-encoded query value
- [ ] `null`/`undefined` are still skipped (unchanged)
- [ ] No param is ever discarded without a signal

**Verification:**
- [ ] `bun test test/url.test.ts`

**Dependencies:** None
**Files:** `src/core/url.ts`, `test/url.test.ts`
**Scope:** XS

## Task 8: `ZpiMethodNotAllowedError.expected`

**Description:** The backend sends `content.expected`; the SDK's error class
drops it, leaving only a prose message. Surface it as a typed field.

**Acceptance criteria:**
- [ ] `err.expected === "GET"` for a 405 body of `{ content: { expected: "GET" } }`
- [ ] Absent field → `undefined`, no throw

**Verification:**
- [ ] `bun test test/errors.fromResponse.test.ts`

**Dependencies:** None
**Files:** `src/core/errors.ts`
**Scope:** XS

## Task 9: Flip must not consume a retry attempt; stream must not leak the 405 body

**Description:** The 405 flip uses `continue`, which increments `attempt` and
robs the call of one real retry (`core/http.ts:108`). And `requestStream`
re-fetches without reading or cancelling the first response body
(`core/http.ts:161-166`), leaking the connection.

**Acceptance criteria:**
- [ ] After a 405 flip, a subsequent 429 still gets the full `maxRetries` budget
- [ ] `requestStream` cancels the 405 response body before re-fetching

**Verification:**
- [ ] `bun test test/retry.test.ts test/stream.test.ts`

**Dependencies:** Task 4
**Files:** `src/core/http.ts`
**Scope:** Small

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Relaxing method enforcement weakens API hygiene | Low | Only `GET`↔`POST` on read-only scrapes; mutating verbs still 405. Docs keep advertising the declared verb. |
| Changing the default verb breaks a caller relying on POST-first | Low | `opts.method` is still authoritative and untouched; the BE now accepts both anyway. |
| Excluding `method_not_allowed` from billing lets someone farm free 405s | Very low | A 405 does no scraping work and still consumes the per-minute throttle. |
| JSON-encoding object params changes GET wire format | Low | Zero GET endpoints in the catalog declare array/object params today (all 5 are on POST `/chat` endpoints). |
| Shared module-level memo leaks between tenants in one process | None | It maps `projectKey/endpoint → verb`. No credentials, no user data — the same public fact the catalog serves. |

## Open Questions

None — resolved before implementation:
- Backend relaxes GET↔POST **and** the SDK is fixed (not one or the other).
- All three secondary bugs (Tasks 7–9) are in scope.
