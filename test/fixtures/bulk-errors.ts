// Captured BE bulk-submit error envelopes — one per contract-table row from
// zpi-backend/src/routes/V1.ts bulkSubmit switch. Bulk-specific variants carry
// the discriminator inside error:{code,message}, distinct from the plan_gate /
// invalid_params / rate_limit shapes at the same HTTP status. Drives the
// fixture-per-variant bulk regression test. Mirrors the be-errors.ts Fixture shape.

import type { Fixture } from "./be-errors";

// 403 bulk_not_enabled — {error:{code,message}} (NO required_plan/upgrade_url)
export const bulkNotEnabled: Fixture = {
  status: 403,
  body: {
    error: {
      code: "bulk_not_enabled",
      message: "Bulk submit is not enabled for this scraper.",
    },
  },
};

// 400 cap_exceeded — {error:{code,message},cap,submitted} (top-level cap/submitted)
export const bulkCapExceeded: Fixture = {
  status: 400,
  body: {
    error: {
      code: "bulk_cap_exceeded",
      message: "Bulk submission cap exceeded.",
    },
    cap: 50,
    submitted: 80,
  },
};

// 422 idempotency_reuse — {error:{code,message}}
export const idempotencyReuse: Fixture = {
  status: 422,
  body: {
    error: {
      code: "idempotency_key_reuse",
      message: "Idempotency-Key already used with a different request body.",
    },
  },
};

// 429 quota_exceeded — {error:{code,message},used,limit,requested} (top-level)
export const quotaExceeded: Fixture = {
  status: 429,
  body: {
    error: {
      code: "quota_exceeded",
      message: "Monthly quota exceeded for this bulk submission.",
    },
    used: 30,
    limit: 50,
    requested: 40,
  },
};

// 400 no_items — invalid_params shape (errors:[{path:"items",...}]); MUST stay
// ZpiInvalidParamsError, proving the bulk 400 discriminator doesn't over-match.
export const bulkNoItems: Fixture = {
  status: 400,
  body: {
    content: null,
    message: "Invalid params",
    errors: [{ path: "items", message: "invalid url: x" }],
  },
};

// 403 plan_gate — standard plan upgrade shape; MUST stay ZpiPlanGateError, proving
// the bulk 403 discriminator doesn't collide with plan_gate.
export const bulkPlanGate: Fixture = {
  status: 403,
  body: {
    error: {
      code: "plan_upgrade_required",
      message: "This endpoint requires the Pro plan.",
    },
    required_plan: "pro",
    upgrade_url: "https://zpi.web.id/pricing",
  },
  headers: { "Cache-Control": "no-store, private" },
};
