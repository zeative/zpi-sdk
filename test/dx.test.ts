import { describe, expect, it, vi } from "vitest";
import { ZpiClient } from "../src/client";
import { ZpiMethodNotAllowedError } from "../src/core/errors";
import { normalizeEndpoint } from "../src/core/url";

const ENVELOPE = { project: "p", data: { ok: 1 }, timestamp: "t" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("normalizeEndpoint", () => {
  it("passes a plain slug through", () => {
    expect(normalizeEndpoint("profile")).toEqual({
      slug: "profile",
      rest: undefined,
    });
  });

  it("trims slashes", () => {
    expect(normalizeEndpoint("/profile/")).toEqual({
      slug: "profile",
      rest: undefined,
    });
  });

  it("drops :param placeholders (BE fills them from params)", () => {
    expect(normalizeEndpoint("resolve/:url")).toEqual({
      slug: "resolve",
      rest: undefined,
    });
    expect(normalizeEndpoint("/:test")).toEqual({ slug: ":test", rest: undefined });
  });

  it("keeps literal extra segments as pathRest", () => {
    expect(normalizeEndpoint("resolve/abc")).toEqual({
      slug: "resolve",
      rest: "abc",
    });
  });

  it("merges explicit pathRest after endpoint literals", () => {
    expect(normalizeEndpoint("users/:id/posts", "/42/")).toEqual({
      slug: "users",
      rest: "posts/42",
    });
  });
});

describe("run() forgiving endpoint", () => {
  it("strips :param from the endpoint — param travels in the body instead", async () => {
    const f = vi.fn(async () => json(ENVELOPE));
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.run("bypass-tools:encurtador", "resolve/:url", {
      url: "https://l1nq.com/x",
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/bypass-tools:encurtador/resolve");
    expect(url).not.toContain(":url");
    expect(init.body).toBe(JSON.stringify({ url: "https://l1nq.com/x" }));
  });
});

describe("run() auto method", () => {
  it("flips POST→GET on 405 and succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Method POST not allowed. Use GET." }, 405))
      .mockResolvedValueOnce(json(ENVELOPE));
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    const out = await client.run("cat:s", "ep", { a: 1 });
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    const [url2, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.method).toBe("GET");
    expect(url2).toContain("a=1");
    expect(init2.body).toBeUndefined();
  });

  it("memoizes the learned verb — next call uses GET directly", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "use GET" }, 405))
      .mockImplementation(async () => json(ENVELOPE));
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await client.run("cat:s", "ep", { a: 1 });
    await client.run("cat:s", "ep", { a: 2 });
    expect(f).toHaveBeenCalledTimes(3);
    const [, init3] = f.mock.calls[2] as unknown as [string, RequestInit];
    expect(init3.method).toBe("GET");
  });

  it("does NOT flip when the caller passed an explicit method", async () => {
    const f = vi.fn(async () => json({ message: "use GET" }, 405));
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await expect(
      client.run("cat:s", "ep", {}, { method: "POST" })
    ).rejects.toBeInstanceOf(ZpiMethodNotAllowedError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("flips only once — second 405 throws", async () => {
    const f = vi.fn(async () => json({ message: "nope" }, 405));
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    await expect(client.run("cat:s", "ep")).rejects.toBeInstanceOf(
      ZpiMethodNotAllowedError
    );
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("stream() auto method", () => {
  it("flips POST→GET on 405 before streaming", async () => {
    const stream = new Response("hello", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "use GET" }, 405))
      .mockResolvedValueOnce(stream);
    const client = new ZpiClient({ apiKey: "k", fetch: f });
    const chunks: unknown[] = [];
    for await (const c of client.stream("cat:s", "ep", { q: 1 })) chunks.push(c);
    expect(chunks.join("")).toBe("hello");
    expect(f).toHaveBeenCalledTimes(2);
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.method).toBe("GET");
  });
});
