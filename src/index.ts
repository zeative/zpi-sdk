// Universal core entry. run() + client land in Phase 2; typed errors arrive in plan 02.
export const VERSION = "0.1.2" as const;

export { ZpiClient } from "./client";
export type { ZpiClientOptions } from "./core/config";
export {
  ZpiAbortError,
  ZpiAuthError,
  ZpiBulkCapError,
  ZpiBulkNotEnabledError,
  ZpiDisabledError,
  ZpiError,
  ZpiExecError,
  ZpiIdempotencyError,
  ZpiInvalidParamsError,
  ZpiMethodNotAllowedError,
  ZpiNetworkError,
  ZpiNotFoundError,
  ZpiPlanGateError,
  ZpiRateLimitError,
  ZpiServerError,
  ZpiTimeoutError,
} from "./core/errors";
export type { RunOpts, ScraperMap, ScraperParams, ScraperResult } from "./resources/exec";
export type { StreamEvent, StreamOpts } from "./resources/stream";
export type { SseEvent } from "./core/sse";
export type {
  Catalog,
  CatalogList,
  CatalogListItem,
  CatalogListOpts,
  Category,
  EndpointSchema,
  ScraperDetail,
  ScraperEndpoint,
  SchemaField,
} from "./resources/catalog";
export { BulkJob } from "./resources/bulk";
export type {
  Bulk,
  BulkItem,
  BulkItemResult,
  BulkItemStatus,
  BulkJobData,
  BulkJobStatus,
  BulkSubmitOpts,
  BulkWaitOpts,
} from "./resources/bulk";
