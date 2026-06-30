---
"zpi-sdk": patch
---

Add the `./mcp` subpath entry: `createMcpClient` (lazy initialize handshake + generic listTools/callTool over hand-rolled JSON-RPC-over-fetch) plus the typed `ZpiMcpError`. Zero new runtime deps. Also widen `ZpiError.code` to `string | number` so JSON-RPC numeric codes fit the shared hierarchy (backward-compatible superset). The `.` root type surface is unchanged (same 43 exports); only the dts emit layout was refreshed since `./mcp` now shares `core/errors`.
