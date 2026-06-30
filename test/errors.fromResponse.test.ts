import { describe, expect, it } from "vitest";
import {
  fromResponse,
  ZpiAuthError,
  ZpiDisabledError,
  ZpiError,
  ZpiExecError,
  ZpiInvalidParamsError,
  ZpiMethodNotAllowedError,
  ZpiNotFoundError,
  ZpiPlanGateError,
  ZpiRateLimitError,
  ZpiServerError,
} from "../src/core/errors";
import * as fx from "./fixtures/be-errors";

describe("fromResponse — typed error mapping per contract row", () => {
  it("400 invalid_params → ZpiInvalidParamsError", () => {
    const e = fromResponse(fx.invalidParams.status, fx.invalidParams.body);
    expect(e).toBeInstanceOf(ZpiInvalidParamsError);
    expect(e).toBeInstanceOf(ZpiError);
    expect((e as ZpiInvalidParamsError).errors).toEqual([
      { path: "username", message: "Required" },
    ]);
    expect(e.message).toBe("Invalid params");
    expect(e.status).toBe(400);
    expect(e.raw).toEqual(fx.invalidParams.body);
    expect(e.name).toBe("ZpiInvalidParamsError");
  });

  it("400 exec error → ZpiExecError", () => {
    const e = fromResponse(fx.execError.status, fx.execError.body) as ZpiExecError;
    expect(e).toBeInstanceOf(ZpiExecError);
    expect(e.message).toBe("Upstream returned 502");
    expect(e.error).toBe("Upstream returned 502");
    expect(e.errors).toEqual(["bad gateway"]);
    expect(e.context).toEqual({ attempt: 2 });
    expect(e.project).toBe("social:instagram");
    expect(e.status).toBe(400);
    expect(e.raw).toEqual(fx.execError.body);
  });

  it("401 → ZpiAuthError", () => {
    const e = fromResponse(fx.auth.status, fx.auth.body);
    expect(e).toBeInstanceOf(ZpiAuthError);
    expect(e.message).toBe(
      "API key required (x-api-key, Authorization: Bearer, or api-key header)"
    );
    expect(e.status).toBe(401);
    expect(e.raw).toEqual(fx.auth.body);
  });

  it("403 plan_gate → ZpiPlanGateError", () => {
    const e = fromResponse(
      fx.planGate.status,
      fx.planGate.body,
      fx.planGate.headers
    ) as ZpiPlanGateError;
    expect(e).toBeInstanceOf(ZpiPlanGateError);
    expect(e.code).toBe("plan_upgrade_required");
    expect(e.requiredPlan).toBe("pro");
    expect(e.upgradeUrl).toBe("https://zpi.web.id/pricing");
    expect(e.message).toBe("This endpoint requires the Pro plan.");
    expect(e.status).toBe(403);
    expect(e.raw).toEqual(fx.planGate.body);
  });

  it("404 → ZpiNotFoundError", () => {
    const e = fromResponse(fx.notFound.status, fx.notFound.body);
    expect(e).toBeInstanceOf(ZpiNotFoundError);
    expect(e.message).toBe('Invalid project key "nope:scraper"');
    expect(e.status).toBe(404);
    expect(e.raw).toEqual(fx.notFound.body);
  });

  it("405 → ZpiMethodNotAllowedError", () => {
    const e = fromResponse(fx.methodNotAllowed.status, fx.methodNotAllowed.body);
    expect(e).toBeInstanceOf(ZpiMethodNotAllowedError);
    expect(e.message).toBe("Method not allowed");
    expect(e.status).toBe(405);
    expect(e.raw).toEqual(fx.methodNotAllowed.body);
  });

  it("429 rate_limit → ZpiRateLimitError (body + Retry-After header)", () => {
    const e = fromResponse(
      fx.rateLimit.status,
      fx.rateLimit.body,
      fx.rateLimit.headers
    ) as ZpiRateLimitError;
    expect(e).toBeInstanceOf(ZpiRateLimitError);
    expect(e.limit).toBe(60);
    expect(e.used).toBe(60);
    expect(e.window).toBe("minute");
    expect(e.retryAfterSec).toBe(30);
    expect(e.retryAfter).toBe(30);
    expect(e.status).toBe(429);
    expect(e.raw).toEqual(fx.rateLimit.body);
  });

  it("429 also reads Retry-After from a Headers instance", () => {
    const h = new Headers({ "Retry-After": "45" });
    const e = fromResponse(429, fx.rateLimit.body, h) as ZpiRateLimitError;
    expect(e.retryAfter).toBe(45);
  });

  it("500 → ZpiServerError", () => {
    const e = fromResponse(fx.server.status, fx.server.body);
    expect(e).toBeInstanceOf(ZpiServerError);
    expect(e.message).toBe("Module not registered");
    expect(e.status).toBe(500);
    expect(e.raw).toEqual(fx.server.body);
  });

  it("503 → ZpiDisabledError", () => {
    const e = fromResponse(fx.disabled.status, fx.disabled.body);
    expect(e).toBeInstanceOf(ZpiDisabledError);
    expect(e.message).toBe("Scraper temporarily disabled");
    expect(e.status).toBe(503);
    expect(e.raw).toEqual(fx.disabled.body);
  });

  it("403 unknown shape → falls back but NEVER drops .raw", () => {
    const e = fromResponse(fx.unknownShape.status, fx.unknownShape.body);
    expect(e).toBeInstanceOf(ZpiError);
    expect(e.status).toBe(403);
    expect(e.raw).toEqual({ weird: true });
  });

  it("unknown status → base ZpiError with raw + status preserved", () => {
    const body = { anything: 1 };
    const e = fromResponse(418, body);
    expect(e).toBeInstanceOf(ZpiError);
    expect(e.status).toBe(418);
    expect(e.raw).toEqual(body);
  });

  it("reads requestId from x-request-id header", () => {
    const e = fromResponse(500, fx.server.body, { "x-request-id": "req-123" });
    expect(e.requestId).toBe("req-123");
  });
});
