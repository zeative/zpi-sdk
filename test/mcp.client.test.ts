import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/core/config";
import { ZpiMcpError } from "../src/core/errors";
import { createMcpClient } from "../src/mcp/client";

function jsonRpcResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Sequenced fake fetch: returns queued responses in order, records each request body.
function sequencedFetch(responses: Response[]) {
  let i = 0;
  const bodies: unknown[] = [];
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
    return responses[i++] ?? jsonRpcResponse({ jsonrpc: "2.0", result: {} });
  });
  return { f, bodies };
}

function bodyAt(bodies: unknown[], idx: number): Record<string, unknown> {
  return bodies[idx] as Record<string, unknown>;
}

describe("createMcpClient handshake + listTools", () => {
  it("does lazy initialize -> notifications/initialized -> tools/list and returns server tools", async () => {
    const tools = [
      { name: "scrape", description: "run a scraper", inputSchema: {} },
      { name: "list", description: "list scrapers" },
    ];
    const { f, bodies } = sequencedFetch([
      jsonRpcResponse({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }),
      new Response(null, { status: 202 }),
      jsonRpcResponse({ jsonrpc: "2.0", id: 2, result: { tools } }),
    ]);
    const config = resolveConfig({ apiKey: "k", fetch: f });
    const client = createMcpClient(config);

    const out = await client.listTools();

    expect(out).toEqual(tools);
    // initialize ran before tools/list, with the notification in between.
    expect(bodyAt(bodies, 0).method).toBe("initialize");
    expect(bodyAt(bodies, 1).method).toBe("notifications/initialized");
    expect(bodyAt(bodies, 1).id).toBeUndefined(); // notification omits id
    expect(bodyAt(bodies, 2).method).toBe("tools/list");
    expect(bodyAt(bodies, 2).jsonrpc).toBe("2.0");
    // POSTs to ${baseURL}/mcp with x-api-key.
    const init = f.mock.calls[0][1] as RequestInit;
    expect(String(f.mock.calls[0][0])).toContain("/mcp");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("does the handshake only once across multiple calls", async () => {
    const { f } = sequencedFetch([
      jsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {} }),
      new Response(null, { status: 202 }),
      jsonRpcResponse({ jsonrpc: "2.0", id: 2, result: { tools: [] } }),
      jsonRpcResponse({ jsonrpc: "2.0", id: 3, result: { tools: [] } }),
    ]);
    const client = createMcpClient(resolveConfig({ apiKey: "k", fetch: f }));
    await client.listTools();
    await client.listTools();
    // initialize + initialized + 2x tools/list = 4 calls (no second handshake).
    expect(f).toHaveBeenCalledTimes(4);
  });
});

describe("createMcpClient callTool", () => {
  it("sends tools/call with name + arguments", async () => {
    const { f, bodies } = sequencedFetch([
      jsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {} }),
      new Response(null, { status: 202 }),
      jsonRpcResponse({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "ok" }] } }),
    ]);
    const client = createMcpClient(resolveConfig({ apiKey: "k", fetch: f }));

    const out = await client.callTool("scrape", { url: "x" });

    expect(out).toEqual({ content: [{ type: "text", text: "ok" }] });
    const callBody = bodyAt(bodies, 2);
    expect(callBody.method).toBe("tools/call");
    expect(callBody.params).toEqual({ name: "scrape", arguments: { url: "x" } });
  });
});

describe("createMcpClient JSON-RPC error", () => {
  it("rejects with ZpiMcpError carrying .raw and .code", async () => {
    const rpcError = { code: -32601, message: "Method not found", data: { method: "tools/list" } };
    const { f } = sequencedFetch([
      jsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {} }),
      new Response(null, { status: 202 }),
      jsonRpcResponse({ jsonrpc: "2.0", id: 2, error: rpcError }),
    ]);
    const client = createMcpClient(resolveConfig({ apiKey: "k", fetch: f }));

    const err = await client.listTools().then(
      () => null,
      (e) => e
    );

    expect(err).toBeInstanceOf(ZpiMcpError);
    expect(err.code).toBe(-32601);
    expect(err.raw).toEqual(rpcError);
    expect(err.data).toEqual({ method: "tools/list" });
    // apiKey must never leak onto the error (T-07-01).
    expect(JSON.stringify(err)).not.toContain("k");
  });
});
