import { describe, expect, it, vi } from "vitest";
import { ZpiClient } from "../src/client";
import { ZpiError } from "../src/core/errors";

const SECRET = "SECRET-KEY-DO-NOT-LEAK";

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// Each variant: a fetch that returns (or throws) one error shape.
const variants: Array<{ name: string; fetch: typeof globalThis.fetch }> = [
  {
    name: "403 plan_gate",
    fetch: vi.fn(async () =>
      json(
        { error: { code: "plan_upgrade_required", message: "upgrade" }, required_plan: "pro" },
        403
      )
    ),
  },
  {
    name: "429 rate_limit",
    fetch: vi.fn(async () =>
      json({ success: false, message: "rate", content: { limit: 10, used: 11 } }, 429)
    ),
  },
  {
    name: "400 invalid_params",
    fetch: vi.fn(async () =>
      json({ content: null, message: "Invalid params", errors: [{ path: "x", message: "y" }] }, 400)
    ),
  },
  {
    name: "500 server",
    fetch: vi.fn(async () => json({ content: null, message: "boom", errors: [] }, 500)),
  },
  {
    name: "network throw",
    fetch: vi.fn(async () => {
      throw new TypeError("fetch failed");
    }),
  },
];

describe("error redaction — apiKey absent from every thrown error", () => {
  for (const v of variants) {
    it(`${v.name}: sentinel key absent from message/JSON/String/raw`, async () => {
      const client = new ZpiClient({
        apiKey: SECRET,
        fetch: v.fetch,
        maxRetries: 0,
      });
      const err = await client.run("cat:s", "ep").catch((e) => e as ZpiError);
      expect(err).toBeInstanceOf(ZpiError);

      expect(err.message.includes(SECRET)).toBe(false);
      expect(JSON.stringify(err).includes(SECRET)).toBe(false);
      expect(String(err).includes(SECRET)).toBe(false);
      expect(JSON.stringify((err as ZpiError).raw ?? null).includes(SECRET)).toBe(false);
    });
  }
});
