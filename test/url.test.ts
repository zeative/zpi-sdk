import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/core/config";
import { appendQuery, buildUrl } from "../src/core/url";

describe("buildUrl", () => {
  it("joins /v1/{projectKey}/{endpoint} preserving the literal colon", () => {
    const url = buildUrl(
      "https://api.zpi.web.id",
      "social:instagram",
      "profile"
    );
    expect(url).toContain("/v1/social:instagram/profile");
    expect(url).toBe("https://api.zpi.web.id/v1/social:instagram/profile");
  });

  it("supports bare legacy key", () => {
    expect(buildUrl("https://api.zpi.web.id", "instagram", "profile")).toBe(
      "https://api.zpi.web.id/v1/instagram/profile"
    );
  });

  it("appends pathRest after the endpoint", () => {
    expect(
      buildUrl("https://api.zpi.web.id", "social:instagram", "profile", "a/b")
    ).toBe("https://api.zpi.web.id/v1/social:instagram/profile/a/b");
  });

  it("trims leading/trailing slashes from pathRest", () => {
    expect(
      buildUrl("https://api.zpi.web.id", "x", "y", "/a/b/")
    ).toBe("https://api.zpi.web.id/v1/x/y/a/b");
  });

  it("strips a trailing slash on baseURL", () => {
    expect(buildUrl("https://api.zpi.web.id/", "x", "y")).toBe(
      "https://api.zpi.web.id/v1/x/y"
    );
  });
});

describe("appendQuery", () => {
  it("appends stringified params to the search string", () => {
    const out = appendQuery("https://api.zpi.web.id/v1/x/y", {
      username: "alice",
      n: 3,
    });
    expect(out).toContain("username=alice");
    expect(out).toContain("n=3");
  });

  it("drops undefined and nested object/array values", () => {
    const out = appendQuery("https://api.zpi.web.id/v1/x/y", {
      a: "1",
      b: undefined,
      c: { nested: true },
      d: [1, 2],
    });
    expect(out).toContain("a=1");
    expect(out).not.toContain("b=");
    expect(out).not.toContain("c=");
    expect(out).not.toContain("d=");
  });

  it("returns url unchanged when no params", () => {
    const u = "https://api.zpi.web.id/v1/x/y";
    expect(appendQuery(u, undefined)).toBe(u);
    expect(appendQuery(u, {})).toBe(u);
  });
});

describe("resolveConfig", () => {
  it("throws when apiKey is missing/empty", () => {
    // @ts-expect-error intentional missing apiKey
    expect(() => resolveConfig({})).toThrow();
    expect(() => resolveConfig({ apiKey: "" })).toThrow();
  });

  it("applies production defaults", () => {
    const cfg = resolveConfig({ apiKey: "k" });
    expect(cfg.baseURL).toBe("https://api.zpi.web.id");
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.fetch).toBe(globalThis.fetch);
    expect(cfg.defaultHeaders).toEqual({});
    expect(cfg.apiKey).toBe("k");
  });

  it("respects every override", () => {
    const fakeFetch = (async () => new Response()) as typeof globalThis.fetch;
    const cfg = resolveConfig({
      apiKey: "k",
      baseURL: "http://localhost:4000",
      defaultHeaders: { "x-trace": "1" },
      fetch: fakeFetch,
      timeoutMs: 5000,
      maxRetries: 0,
    });
    expect(cfg.baseURL).toBe("http://localhost:4000");
    expect(cfg.defaultHeaders).toEqual({ "x-trace": "1" });
    expect(cfg.fetch).toBe(fakeFetch);
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.maxRetries).toBe(0);
  });
});
