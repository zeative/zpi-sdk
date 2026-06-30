// MCP client: lazy initialize -> notifications/initialized handshake, then
// generic listTools/callTool over the JSON-RPC transport. Generic by design —
// lists whatever tools the server reports (no hardcoded set).

import { type ZpiClientOptions, resolveConfig } from "../core/config";
import { type JsonRpcRequest, PROTOCOL_VERSION, rpcRequest } from "./transport";

// Kept local so `./mcp` never imports `.` (the lean root entry).
const MCP_CLIENT_VERSION = "0.0.0";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function createMcpClient(options: ZpiClientOptions): McpClient {
  const config = resolveConfig(options);
  let sessionId: string | undefined;
  let nextId = 1;
  let initPromise: Promise<void> | undefined;

  async function send(method: string, params?: unknown): Promise<unknown> {
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params,
    };
    const { result, sessionId: sid } = await rpcRequest(config, message, sessionId);
    if (sid) sessionId = sid;
    return result;
  }

  async function notify(method: string, params?: unknown): Promise<void> {
    // Notifications omit `id` — server acks with 202/empty, no result.
    const message: JsonRpcRequest = { jsonrpc: "2.0", method, params };
    await rpcRequest(config, message, sessionId);
  }

  async function ensureInitialized(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        await send("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "zpi-sdk", version: MCP_CLIENT_VERSION },
        });
        await notify("notifications/initialized");
      })().catch((err) => {
        // Allow a later call to retry the handshake.
        initPromise = undefined;
        throw err;
      });
    }
    return initPromise;
  }

  return {
    async listTools(): Promise<McpTool[]> {
      await ensureInitialized();
      const result = await send("tools/list", {});
      const tools = isObj(result) ? result.tools : undefined;
      return Array.isArray(tools) ? (tools as McpTool[]) : [];
    },
    async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
      await ensureInitialized();
      return send("tools/call", { name, arguments: args ?? {} });
    },
  };
}
