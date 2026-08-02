# TODO: Kill the 405 probe

Plan: [tasks/plan.md](./plan.md)

## Phase 1 — Backend: stop the harm (`zpi-backend`)

- [ ] **T1** Accept GET↔POST on read-only endpoints — `src/services/EndpointExecService.ts`
  - [ ] POST to a GET-declared endpoint → 200
  - [ ] GET to a POST-declared endpoint → 200
  - [ ] PUT/PATCH/DELETE → still 405 with `expected`
- [ ] **T2** Remaining 405s are non-billable and non-noisy
  - [ ] `BILLABLE_REQUEST_FILTER` excludes `errorCode: "method_not_allowed"` — `src/services/UsageService.ts`
  - [ ] No `endpoint.requestCount` bump — `src/utils/request-log.utils.ts`
  - [ ] No `request.error` webhook — `src/utils/request-log.utils.ts`
  - [ ] `Allow: <expected>` response header — `src/routes/V1.ts`
- [ ] **T3** Public `successRate` ignores `method_not_allowed` — `src/routes/index.ts`

### ✅ Checkpoint: Backend
- [ ] `bun test` green
- [ ] Method-parity suite updated
- [ ] Manual curl: POST on a GET endpoint returns 200

## Phase 2 — SDK: send the right verb (`zpi-sdk`)

- [ ] **T4** Default GET + resolve 405 from `content.expected` / `Allow`
  - [ ] `src/core/http.ts` — `request()` and `requestStream()`
  - [ ] `src/resources/exec.ts` — `buildDescriptor()`
  - [ ] `src/resources/stream.ts` — `runStream()`
  - [ ] Explicit `opts.method` still wins
- [ ] **T5** Process-wide `methodMemo`, seeded from the catalog
  - [ ] Module-level default map, overridable via options — `src/core/config.ts`
  - [ ] `catalog.get()` populates it — `src/resources/catalog.ts`
- [ ] **T6** Codegen emits the verb map
  - [ ] `ZPI_METHODS` runtime export, sorted — `src/codegen/emit.ts`
  - [ ] `method` threaded through `generate()` — `src/codegen.ts`
  - [ ] `client.useMethods()` — `src/client.ts`

### ✅ Checkpoint: SDK core
- [ ] `bun test` green
- [ ] `bun run build` + size-limit pass

## Phase 3 — SDK: three bugs on the same path

- [ ] **T7** `appendQuery` encodes object/array instead of dropping — `src/core/url.ts`
- [ ] **T8** `ZpiMethodNotAllowedError.expected` — `src/core/errors.ts`
- [ ] **T9** Flip keeps the retry budget; stream cancels the 405 body — `src/core/http.ts`

### ✅ Checkpoint: Complete
- [ ] Full suite green + dist builtin-scan clean
- [ ] Runtime smokes (node/bun/deno/cjs/browser-proxy) pass
- [ ] Changeset + version bump
- [ ] Published to npm
- [ ] **Rotate the npm token that was pasted in chat**
