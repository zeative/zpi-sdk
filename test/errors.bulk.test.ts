import { describe, expect, it } from "vitest";
import {
  fromResponse,
  ZpiBulkCapError,
  ZpiBulkNotEnabledError,
  ZpiError,
  ZpiIdempotencyError,
  ZpiInvalidParamsError,
  ZpiPlanGateError,
  ZpiRateLimitError,
} from "../src/core/errors";
import * as fx from "./fixtures/bulk-errors";

describe("fromResponse — bulk submit error variants (BULK-03)", () => {
  it("403 bulk_not_enabled → ZpiBulkNotEnabledError", () => {
    const e = fromResponse(
      fx.bulkNotEnabled.status,
      fx.bulkNotEnabled.body
    ) as ZpiBulkNotEnabledError;
    expect(e).toBeInstanceOf(ZpiBulkNotEnabledError);
    expect(e).toBeInstanceOf(ZpiError);
    expect(e.code).toBe("bulk_not_enabled");
    expect(e.message).toBe("Bulk submit is not enabled for this scraper.");
    expect(e.status).toBe(403);
    expect(e.raw).toEqual(fx.bulkNotEnabled.body);
    expect(e.name).toBe("ZpiBulkNotEnabledError");
  });

  it("400 bulk_cap_exceeded → ZpiBulkCapError with cap+submitted", () => {
    const e = fromResponse(
      fx.bulkCapExceeded.status,
      fx.bulkCapExceeded.body
    ) as ZpiBulkCapError;
    expect(e).toBeInstanceOf(ZpiBulkCapError);
    expect(e).toBeInstanceOf(ZpiError);
    expect(e.code).toBe("bulk_cap_exceeded");
    expect(e.cap).toBe(50);
    expect(e.submitted).toBe(80);
    expect(e.message).toBe("Bulk submission cap exceeded.");
    expect(e.status).toBe(400);
    expect(e.raw).toEqual(fx.bulkCapExceeded.body);
  });

  it("422 idempotency_key_reuse → ZpiIdempotencyError", () => {
    const e = fromResponse(
      fx.idempotencyReuse.status,
      fx.idempotencyReuse.body
    ) as ZpiIdempotencyError;
    expect(e).toBeInstanceOf(ZpiIdempotencyError);
    expect(e).toBeInstanceOf(ZpiError);
    expect(e.code).toBe("idempotency_key_reuse");
    expect(e.message).toBe(
      "Idempotency-Key already used with a different request body."
    );
    expect(e.status).toBe(422);
    expect(e.raw).toEqual(fx.idempotencyReuse.body);
  });

  it("429 quota_exceeded → ZpiRateLimitError with used+limit+requested", () => {
    const e = fromResponse(
      fx.quotaExceeded.status,
      fx.quotaExceeded.body
    ) as ZpiRateLimitError;
    expect(e).toBeInstanceOf(ZpiRateLimitError);
    expect(e.used).toBe(30);
    expect(e.limit).toBe(50);
    expect(e.requested).toBe(40);
    expect(e.status).toBe(429);
    expect(e.raw).toEqual(fx.quotaExceeded.body);
  });

  // Non-collision: bulk discriminators must NOT over-match the existing mappings.
  it("403 plan_gate stays ZpiPlanGateError (not a bulk class)", () => {
    const e = fromResponse(
      fx.bulkPlanGate.status,
      fx.bulkPlanGate.body,
      fx.bulkPlanGate.headers
    ) as ZpiPlanGateError;
    expect(e).toBeInstanceOf(ZpiPlanGateError);
    expect(e).not.toBeInstanceOf(ZpiBulkNotEnabledError);
    expect(e.requiredPlan).toBe("pro");
    expect(e.code).toBe("plan_upgrade_required");
    expect(e.status).toBe(403);
    expect(e.raw).toEqual(fx.bulkPlanGate.body);
  });

  it("400 no_items stays ZpiInvalidParamsError (not a bulk class)", () => {
    const e = fromResponse(
      fx.bulkNoItems.status,
      fx.bulkNoItems.body
    ) as ZpiInvalidParamsError;
    expect(e).toBeInstanceOf(ZpiInvalidParamsError);
    expect(e).not.toBeInstanceOf(ZpiBulkCapError);
    expect(e.errors.length).toBe(1);
    expect(e.errors[0]).toEqual({ path: "items", message: "invalid url: x" });
    expect(e.status).toBe(400);
    expect(e.raw).toEqual(fx.bulkNoItems.body);
  });
});
