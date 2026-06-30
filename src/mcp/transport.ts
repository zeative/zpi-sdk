// Hand-rolled JSON-RPC-over-fetch transport for the remote /mcp Streamable HTTP
// server. ZERO deps, zero node-builtins — web-standard fetch/Response/Headers only.
// Reuses the injected config.fetch seam + core error mapping. JSON response path
// only this wave; the text/event-stream branch lands in Plan 02.

import type { ResolvedConfig } from "../core/config";
import { fromResponse, ZpiMcpError } from "../core/errors";
import { createSseParser } from "../core/sse";

// MCP protocol version we advertise. The stateless server tolerates a recent
// stable date string and echoes its own negotiated version back.
export const PROTOCOL_VERSION = "2025-06-18";

// Minimal JSON-RPC shapes — read by structure only, never eval'd (T-07-02).
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code?: number | string;
  message?: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: JsonRpcError;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function mcpUrl(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/mcp`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

// Shared JSON-RPC outcome mapper: both the application/json and the
// text/event-stream branches funnel a single selected message here so an
// `error` -> ZpiMcpError mapping is byte-identical regardless of framing.
function resolveJsonRpc(body: JsonRpcResponse | undefined): unknown {
  if (!isObj(body)) return undefined;
  if (isObj(body.error)) {
    const e = body.error as JsonRpcError;
    throw new ZpiMcpError(
      typeof e.message === "string" ? e.message : "MCP JSON-RPC error",
      { code: e.code, data: e.data, raw: body.error }
    );
  }
  return body.result;
}

// Pick the response message: prefer the one whose id matches the request id;
// otherwise the last message carrying a result/error (T-07-04: hostile/extra
// frames are ignored — only an id-match or the final result/error is honored).
function selectMessage(
  messages: JsonRpcResponse[],
  requestId?: number
): JsonRpcResponse | undefined {
  if (requestId !== undefined) {
    const matched = messages.find((m) => m.id === requestId);
    if (matched) return matched;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isObj(m) && ("result" in m || "error" in m)) return m;
  }
  return messages[messages.length - 1];
}

// Parse a text/event-stream body into JSON-RPC messages by reusing the vendored
// SSE parser. Each `data:` frame carries one JSON-RPC message; non-JSON frames
// are skipped best-effort (T-07-04).
async function readSseMessages(res: Response): Promise<JsonRpcResponse[]> {
  const reader = res.body?.getReader();
  if (!reader) return [];
  const decoder = new globalThis.TextDecoder();
  const parser = createSseParser();
  const events: { data: string }[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        events.push(ev);
      }
    }
  }
  for (const ev of parser.flush()) events.push(ev);

  const messages: JsonRpcResponse[] = [];
  for (const ev of events) {
    try {
      const parsed = JSON.parse(ev.data);
      if (isObj(parsed)) messages.push(parsed as JsonRpcResponse);
    } catch {
      // skip non-JSON frame
    }
  }
  return messages;
}

// Send one JSON-RPC message. For requests (with id) returns `{ result, sessionId }`;
// for notifications (no id) the server replies 202/empty — returns undefined result.
export async function rpcRequest(
  config: ResolvedConfig,
  message: JsonRpcRequest,
  session?: string
): Promise<{ result: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-api-key": config.apiKey,
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (session) headers["mcp-session-id"] = session;

  const res = await config.fetch(mcpUrl(config.baseURL), {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });

  const sessionId = res.headers.get("mcp-session-id") ?? session;

  if (!res.ok) {
    const body = await readJson(res);
    throw fromResponse(res.status, body, res.headers);
  }

  // Notifications + empty acks: nothing to parse.
  if (res.status === 202 || res.headers.get("content-length") === "0") {
    return { result: undefined, sessionId };
  }

  const ct = res.headers.get("content-type") ?? "";

  if (ct.includes("text/event-stream")) {
    const messages = await readSseMessages(res);
    const selected = selectMessage(messages, message.id);
    return { result: resolveJsonRpc(selected), sessionId };
  }

  if (ct.includes("application/json")) {
    const body = (await readJson(res)) as JsonRpcResponse | undefined;
    return { result: resolveJsonRpc(body), sessionId };
  }

  // Unknown 2xx content-type with a body we can't classify.
  return { result: undefined, sessionId };
}
