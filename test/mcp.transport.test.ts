import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { ZpiAuthError, ZpiMcpError } from "../src/core/errors";
import { createMcpClient } from "../src/mcp/client";
import { rpcRequest } from "../src/mcp/transport";

const API_KEY = "super-secret-mcp-key-xyz";

// JSON-content-type JSON-RPC response (mirrors the application/json path).
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// SSE-framed JSON-RPC response: each message goes out as its own `data:` frame.
// Splits across multiple stream chunks to exercise the cross-chunk parser path.
function sseResponse(messages: unknown[], status = 200) {
  const frames = messages.map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`);
  const chunks: string[] = [];
  for (const frame of frames) {
    const mid = Math.floor(frame.length / 2);
    chunks.push(frame.slice(0, mid), frame.slice(mid));
  }
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

// Queue responses in order; default to an empty 202 ack once drained.
function sequencedFetch(responses: Response[]) {
  let i = 0;
  const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return responses[i++] ?? new Response(null, { status: 202 });
  });
  return f;
}

describe("mcp transport — SSE-framed responses", () => {
  it("parses a tools/list response framed as text/event-stream identically to the JSON path", async () => {
    const tools = [
      { name: "scrape", description: "run a scraper", inputSchema: {} },
      { name: "list", description: "list scrapers" },
    ];

    // JSON path
    const jsonClient = createMcpClient({
      apiKey: API_KEY,
      fetch: sequencedFetch([
        jsonResponse({ jsonrpc: "2.0", id: 1, result: {} }),
        new Response(null, { status: 202 }),
        jsonResponse({ jsonrpc: "2.0", id: 2, result: { tools } }),
      ]) as unknown as typeof globalThis.fetch,
    });
    const jsonTools = await jsonClient.listTools();

    // SSE path — same logical messages, event-stream framing.
    const sseClient = createMcpClient({
      apiKey: API_KEY,
      fetch: sequencedFetch([
        sseResponse([{ jsonrpc: "2.0", id: 1, result: {} }]),
        new Response(null, { status: 202 }),
        sseResponse([{ jsonrpc: "2.0", id: 2, result: { tools } }]),
      ]) as unknown as typeof globalThis.fetch,
    });
    const sseTools = await sseClient.listTools();

    expect(sseTools).toEqual(jsonTools);
    expect(sseTools).toEqual(tools);
  });

  it("selects the id-matched message when an SSE body carries extra frames", async () => {
    const f = sequencedFetch([
      sseResponse([
        { jsonrpc: "2.0", method: "notifications/progress", params: {} }, // no id
        { jsonrpc: "2.0", id: 1, result: { ok: true } },
      ]),
    ]) as unknown as typeof globalThis.fetch;
    const { result } = await rpcRequest(resolveConfig({ apiKey: API_KEY, fetch: f }), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(result).toEqual({ ok: true });
  });

  it("maps a JSON-RPC error in an SSE frame to ZpiMcpError", async () => {
    const f = sequencedFetch([
      sseResponse([
        { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } },
      ]),
    ]) as unknown as typeof globalThis.fetch;
    await expect(
      rpcRequest(resolveConfig({ apiKey: API_KEY, fetch: f }), {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      })
    ).rejects.toBeInstanceOf(ZpiMcpError);
  });
});

describe("mcp transport — HTTP-level errors", () => {
  it("maps HTTP 401 to ZpiAuthError, not ZpiMcpError", async () => {
    const f = sequencedFetch([
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ]) as unknown as typeof globalThis.fetch;
    const err = await rpcRequest(resolveConfig({ apiKey: API_KEY, fetch: f }), {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    }).then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(ZpiAuthError);
    expect(err).not.toBeInstanceOf(ZpiMcpError);
  });
});

describe("mcp transport — key redaction (T-07-03)", () => {
  it("apiKey is absent from a serialized ZpiMcpError and its .raw", async () => {
    const rpcError = { code: -32000, message: "boom", data: { detail: "x" } };
    const f = sequencedFetch([
      jsonResponse({ jsonrpc: "2.0", id: 1, error: rpcError }),
    ]) as unknown as typeof globalThis.fetch;

    const err = await rpcRequest(resolveConfig({ apiKey: API_KEY, fetch: f }), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }).then(
      () => null,
      (e) => e
    );

    expect(err).toBeInstanceOf(ZpiMcpError);
    expect(JSON.stringify(err)).not.toContain(API_KEY);
    expect(JSON.stringify((err as ZpiMcpError).raw)).not.toContain(API_KEY);
    // mcp-session-id echo path must not leak the key either.
    expect(String((err as ZpiMcpError).message)).not.toContain(API_KEY);
  });
});
