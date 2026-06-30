// Public `./mcp` subpath entry — isolated MCP client, zero runtime deps, zero
// node-builtins, reuses only core/{config,errors}. The lean `.` root never imports this.
export { createMcpClient } from "./mcp/client";
export type { McpClient, McpTool } from "./mcp/client";
export { PROTOCOL_VERSION } from "./mcp/transport";
export { ZpiMcpError } from "./core/errors";
