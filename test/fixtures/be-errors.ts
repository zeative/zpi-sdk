// Captured BE /v1 error envelopes — one per contract-table row, mirroring the
// EXACT byte-shapes from zpi-backend/src/routes/V1.ts dispatch + rateLimitMiddleware.ts.
// Used to drive the fromResponse fixture-per-variant regression test.

export interface Fixture {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

// 400 invalid_params — response_bad_request → {content:null,message:"Invalid params",errors:[{path,message}]}
export const invalidParams: Fixture = {
  status: 400,
  body: {
    content: null,
    message: "Invalid params",
    errors: [{ path: "username", message: "Required" }],
  },
};

// 400 exec error — {project,error,errors,context?,timestamp}
export const execError: Fixture = {
  status: 400,
  body: {
    project: "social:instagram",
    error: "Upstream returned 502",
    errors: ["bad gateway"],
    context: { attempt: 2 },
    timestamp: "2026-06-30T00:00:00.000Z",
  },
};

// 401 — response_unauthorized → {content:null,message,errors:[]}
export const auth: Fixture = {
  status: 401,
  body: {
    content: null,
    message: "API key required (x-api-key, Authorization: Bearer, or api-key header)",
    errors: [],
  },
};

// 403 plan_gate — {error:{code,message},required_plan,upgrade_url} + Cache-Control:no-store,private
export const planGate: Fixture = {
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

// 404 — response_not_found → {content:null,message,errors:[]}
export const notFound: Fixture = {
  status: 404,
  body: { content: null, message: 'Invalid project key "nope:scraper"', errors: [] },
};

// 405 — {content:null,message,errors:[]}
export const methodNotAllowed: Fixture = {
  status: 405,
  body: { content: null, message: "Method not allowed", errors: [] },
};

// 429 rate_limit — {success:false,message,content:{limit,used,window,retryAfterSec?}} + headers
export const rateLimit: Fixture = {
  status: 429,
  body: {
    success: false,
    message:
      "Rate limit exceeded — 60 requests/minute (used 60). Upgrade plan or wait ~60s.",
    content: { limit: 60, used: 60, window: "minute", retryAfterSec: 30 },
  },
  headers: {
    "Retry-After": "30",
    "X-RateLimit-Limit-Minute": "60",
    "X-RateLimit-Remaining-Minute": "0",
  },
};

// 500 module_not_registered — {content:null,message,errors:[]}
export const server: Fixture = {
  status: 500,
  body: { content: null, message: "Module not registered", errors: [] },
};

// 503 disabled — {content:null,message,errors:[]}
export const disabled: Fixture = {
  status: 503,
  body: { content: null, message: "Scraper temporarily disabled", errors: [] },
};

// Fallback case — unrecognized shape at a known status (403). Must still set .raw.
export const unknownShape: Fixture = {
  status: 403,
  body: { weird: true },
};
