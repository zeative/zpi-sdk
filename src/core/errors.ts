// Typed error hierarchy for the heterogeneous /v1 BE envelopes. Web-standard only
// (no node built-ins — the dist-scan gate enforces this). Every error keeps `.raw`
// (full parsed body) + `.status` so consumers never lose a backend field.

type HeaderBag = Headers | Record<string, string> | undefined;

// Read a header defensively — supports a `Headers` instance or a plain object.
function getHeader(headers: HeaderBag, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const map = headers as Record<string, string>;
  const lower = name.toLowerCase();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === lower) return map[k];
  }
  return undefined;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function msgOf(body: unknown, fallback: string): string {
  if (isObj(body) && typeof body.message === "string") return body.message;
  return fallback;
}

export class ZpiError extends Error {
  status: number;
  // string for /v1 envelope codes; number for JSON-RPC codes (ZpiMcpError).
  code?: string | number;
  raw: unknown;
  requestId?: string;

  constructor(message: string, status: number, raw: unknown, requestId?: string) {
    super(message);
    this.name = "ZpiError";
    this.status = status;
    this.raw = raw;
    this.requestId = requestId;
    Object.setPrototypeOf(this, ZpiError.prototype);
  }
}

export class ZpiInvalidParamsError extends ZpiError {
  errors: Array<{ path?: string; message?: string }>;
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Invalid params"), status, body, requestId);
    this.name = "ZpiInvalidParamsError";
    this.errors = isObj(body) && Array.isArray(body.errors) ? body.errors : [];
    Object.setPrototypeOf(this, ZpiInvalidParamsError.prototype);
  }
}

export class ZpiExecError extends ZpiError {
  error: string;
  errors: unknown;
  context?: unknown;
  project?: string;
  constructor(body: unknown, status: number, requestId?: string) {
    const b = isObj(body) ? body : {};
    super(typeof b.error === "string" ? b.error : "Execution error", status, body, requestId);
    this.name = "ZpiExecError";
    this.error = typeof b.error === "string" ? b.error : "Execution error";
    this.errors = b.errors;
    this.context = b.context;
    this.project = typeof b.project === "string" ? b.project : undefined;
    Object.setPrototypeOf(this, ZpiExecError.prototype);
  }
}

export class ZpiAuthError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Unauthorized"), status, body, requestId);
    this.name = "ZpiAuthError";
    Object.setPrototypeOf(this, ZpiAuthError.prototype);
  }
}

export class ZpiPlanGateError extends ZpiError {
  requiredPlan?: string;
  upgradeUrl?: string;
  constructor(body: unknown, status: number, requestId?: string) {
    const b = isObj(body) ? body : {};
    const inner = isObj(b.error) ? b.error : {};
    super(
      typeof inner.message === "string" ? inner.message : "Plan upgrade required",
      status,
      body,
      requestId
    );
    this.name = "ZpiPlanGateError";
    this.code = typeof inner.code === "string" ? inner.code : undefined;
    this.requiredPlan = typeof b.required_plan === "string" ? b.required_plan : undefined;
    this.upgradeUrl = typeof b.upgrade_url === "string" ? b.upgrade_url : undefined;
    Object.setPrototypeOf(this, ZpiPlanGateError.prototype);
  }
}

export class ZpiNotFoundError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Not found"), status, body, requestId);
    this.name = "ZpiNotFoundError";
    Object.setPrototypeOf(this, ZpiNotFoundError.prototype);
  }
}

export class ZpiMethodNotAllowedError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Method not allowed"), status, body, requestId);
    this.name = "ZpiMethodNotAllowedError";
    Object.setPrototypeOf(this, ZpiMethodNotAllowedError.prototype);
  }
}

export class ZpiRateLimitError extends ZpiError {
  limit?: number;
  used?: number;
  window?: "minute" | "month" | string;
  retryAfterSec?: number;
  retryAfter?: number;
  requested?: number;
  constructor(body: unknown, status: number, headers: HeaderBag, requestId?: string) {
    super(msgOf(body, "Rate limit exceeded"), status, body, requestId);
    this.name = "ZpiRateLimitError";
    const b = isObj(body) ? body : {};
    const inner = isObj(b.error) ? b.error : {};
    // Two 429 shapes share this subclass: the rate-limit envelope nests fields in
    // content.{limit,used,window}; the bulk quota envelope puts them top-level
    // alongside error.code === "quota_exceeded".
    if (inner.code === "quota_exceeded") {
      this.code = typeof inner.code === "string" ? inner.code : undefined;
      this.limit = typeof b.limit === "number" ? b.limit : undefined;
      this.used = typeof b.used === "number" ? b.used : undefined;
      this.requested = typeof b.requested === "number" ? b.requested : undefined;
    } else {
      const content = isObj(b.content) ? b.content : {};
      this.limit = typeof content.limit === "number" ? content.limit : undefined;
      this.used = typeof content.used === "number" ? content.used : undefined;
      this.window = typeof content.window === "string" ? content.window : undefined;
      this.retryAfterSec =
        typeof content.retryAfterSec === "number" ? content.retryAfterSec : undefined;
    }
    const ra = getHeader(headers, "retry-after");
    const parsed = ra !== undefined ? Number(ra) : NaN;
    this.retryAfter = Number.isFinite(parsed) ? parsed : this.retryAfterSec;
    Object.setPrototypeOf(this, ZpiRateLimitError.prototype);
  }
}

// Bulk-specific subclasses (BULK-03). Each reads the discriminator + message from
// the nested error:{code,message} envelope, keeps the full body as `.raw`.
export class ZpiBulkNotEnabledError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    const inner = isObj(body) && isObj(body.error) ? body.error : {};
    super(
      typeof inner.message === "string" ? inner.message : "Bulk submit not enabled",
      status,
      body,
      requestId
    );
    this.name = "ZpiBulkNotEnabledError";
    this.code = typeof inner.code === "string" ? inner.code : undefined;
    Object.setPrototypeOf(this, ZpiBulkNotEnabledError.prototype);
  }
}

export class ZpiBulkCapError extends ZpiError {
  cap?: number;
  submitted?: number;
  constructor(body: unknown, status: number, requestId?: string) {
    const b = isObj(body) ? body : {};
    const inner = isObj(b.error) ? b.error : {};
    super(
      typeof inner.message === "string" ? inner.message : "Bulk cap exceeded",
      status,
      body,
      requestId
    );
    this.name = "ZpiBulkCapError";
    this.code = typeof inner.code === "string" ? inner.code : undefined;
    this.cap = typeof b.cap === "number" ? b.cap : undefined;
    this.submitted = typeof b.submitted === "number" ? b.submitted : undefined;
    Object.setPrototypeOf(this, ZpiBulkCapError.prototype);
  }
}

export class ZpiIdempotencyError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    const inner = isObj(body) && isObj(body.error) ? body.error : {};
    super(
      typeof inner.message === "string" ? inner.message : "Idempotency key reuse",
      status,
      body,
      requestId
    );
    this.name = "ZpiIdempotencyError";
    this.code = typeof inner.code === "string" ? inner.code : undefined;
    Object.setPrototypeOf(this, ZpiIdempotencyError.prototype);
  }
}

export class ZpiServerError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Server error"), status, body, requestId);
    this.name = "ZpiServerError";
    Object.setPrototypeOf(this, ZpiServerError.prototype);
  }
}

export class ZpiDisabledError extends ZpiError {
  constructor(body: unknown, status: number, requestId?: string) {
    super(msgOf(body, "Service disabled"), status, body, requestId);
    this.name = "ZpiDisabledError";
    Object.setPrototypeOf(this, ZpiDisabledError.prototype);
  }
}

// Transport-level errors (no HTTP body) — thrown by the http seam in plan 03.
// Declared here to keep the whole hierarchy in one file.
export class ZpiNetworkError extends ZpiError {
  constructor(message: string, cause?: unknown) {
    super(message, 0, undefined);
    this.name = "ZpiNetworkError";
    this.cause = cause;
    Object.setPrototypeOf(this, ZpiNetworkError.prototype);
  }
}

export class ZpiTimeoutError extends ZpiError {
  constructor(message: string, cause?: unknown) {
    super(message, 0, undefined);
    this.name = "ZpiTimeoutError";
    this.cause = cause;
    Object.setPrototypeOf(this, ZpiTimeoutError.prototype);
  }
}

export class ZpiAbortError extends ZpiError {
  constructor(message: string, cause?: unknown) {
    super(message, 0, undefined);
    this.name = "ZpiAbortError";
    this.cause = cause;
    Object.setPrototypeOf(this, ZpiAbortError.prototype);
  }
}

// Incoming-webhook verification failure (bad signature / malformed payload).
// status 0 — this is a local check, no HTTP response involved.
export class ZpiWebhookVerifyError extends ZpiError {
  constructor(message: string) {
    super(message, 0, undefined);
    this.name = "ZpiWebhookVerifyError";
    Object.setPrototypeOf(this, ZpiWebhookVerifyError.prototype);
  }
}

// JSON-RPC-level error from the /mcp transport (HTTP was 2xx, but the JSON-RPC
// envelope carried an `error`). status=0 (no HTTP failure). Stores only
// message/code/data/raw — never the apiKey or request headers (T-07-01).
export class ZpiMcpError extends ZpiError {
  data?: unknown;
  constructor(
    message: string,
    opts: { code?: number | string; data?: unknown; raw: unknown; requestId?: string }
  ) {
    super(message, 0, opts.raw, opts.requestId);
    this.name = "ZpiMcpError";
    this.code = opts.code;
    this.data = opts.data;
    Object.setPrototypeOf(this, ZpiMcpError.prototype);
  }
}

// Map a non-2xx response to its typed subclass. Branches on HTTP status;
// disambiguates the two 400 shapes; for any unrecognized shape at a known
// status, falls back to the nearest subclass but ALWAYS keeps `.raw` + `.status`.
export function fromResponse(
  status: number,
  body: unknown,
  headers?: HeaderBag
): ZpiError {
  const reqId = getHeader(headers, "x-request-id");
  const b = isObj(body) ? body : {};
  // The bulk variants nest a discriminator at error.code, distinct from the
  // plan_gate/invalid_params shapes at the same status.
  const inner = isObj(b.error) ? b.error : {};
  const errCode = typeof inner.code === "string" ? inner.code : undefined;

  switch (status) {
    case 400: {
      if (errCode === "bulk_cap_exceeded") return new ZpiBulkCapError(body, status, reqId);
      // exec error carries project+error+timestamp; invalid_params carries
      // message==="Invalid params" or an errors[] of {path,...}.
      const isExec =
        typeof b.project === "string" &&
        typeof b.error !== "undefined" &&
        typeof b.timestamp !== "undefined";
      if (isExec) return new ZpiExecError(body, status, reqId);
      return new ZpiInvalidParamsError(body, status, reqId);
    }
    case 401:
      return new ZpiAuthError(body, status, reqId);
    case 403:
      if (errCode === "bulk_not_enabled")
        return new ZpiBulkNotEnabledError(body, status, reqId);
      return new ZpiPlanGateError(body, status, reqId);
    case 404:
      return new ZpiNotFoundError(body, status, reqId);
    case 405:
      return new ZpiMethodNotAllowedError(body, status, reqId);
    case 422:
      return new ZpiIdempotencyError(body, status, reqId);
    case 429:
      return new ZpiRateLimitError(body, status, headers, reqId);
    case 500:
      return new ZpiServerError(body, status, reqId);
    case 503:
      return new ZpiDisabledError(body, status, reqId);
    default:
      return new ZpiError(
        msgOf(body, `Zapi request failed with status ${status}`),
        status,
        body,
        reqId
      );
  }
}
