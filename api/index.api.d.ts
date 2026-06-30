interface ZpiClientOptions {
    apiKey: string;
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
    maxRetries?: number;
    baseRetryDelayMs?: number;
}

interface RunOpts {
    method?: "GET" | "POST";
    signal?: AbortSignal;
    timeoutMs?: number;
    idempotencyKey?: string;
    headers?: Record<string, string>;
    pathRest?: string;
}
interface ScraperMap {
}
type ScraperResult<K extends string, E extends string> = K extends keyof ScraperMap ? E extends keyof ScraperMap[K] ? ScraperMap[K][E] extends {
    result: infer R;
} ? R : unknown : unknown : unknown;

interface SseEvent {
    event?: string;
    data: string;
    id?: string;
}

interface StreamOpts {
    method?: "GET" | "POST";
    signal?: AbortSignal;
    timeoutMs?: number;
    headers?: Record<string, string>;
    pathRest?: string;
}
type StreamEvent = SseEvent | string;

interface SchemaField {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    default?: unknown;
    example?: unknown;
    enumValues?: unknown[];
    in?: string;
}
interface EndpointSchema {
    fields: SchemaField[];
}
interface CatalogListItem {
    id: string;
    slug: string;
    category: string;
    displayName: string;
    description: string | null;
    tags: string[];
    iconUrl: string | null;
    endpointCount: number;
    totalRequests: number;
    maxCacheTtl: number;
    minPlan: string | null;
    hasBulk: boolean;
    hasGatedEndpoint: boolean;
}
interface CatalogList {
    items: CatalogListItem[];
    nextCursor: string | null;
    total: number;
}
interface ScraperEndpoint {
    id: string;
    slug: string;
    displayName: string | null;
    description: string | null;
    method: string;
    paramsSchema: unknown;
    cacheTtl: number | null;
    pathTemplate: string | null;
    exampleResponse: unknown;
    requestCount: number | null;
    lastRequestAt: string | null;
    enabled: boolean;
    minPlan: string | null;
    bulkEnabled: boolean;
}
interface ScraperDetail {
    id: string;
    slug: string;
    category: string;
    displayName: string;
    description: string | null;
    tags: string[];
    iconUrl: string | null;
    iconUrlPng: string | null;
    enabled: boolean;
    minPlan: string | null;
    createdAt?: string;
    updatedAt?: string;
    endpoints: ScraperEndpoint[];
}
interface Category {
    slug: string;
    displayName: string;
    iconUrl: string | null;
    color: string | null;
    description: string | null;
}
interface CatalogListOpts {
    q?: string;
    cat?: string;
    cursor?: string;
    limit?: number;
}
interface Catalog {
    list(opts?: CatalogListOpts): Promise<CatalogList>;
    get(slug: string): Promise<ScraperDetail>;
    categories(): Promise<Category[]>;
    schema(slug: string, endpoint: string): Promise<EndpointSchema>;
    stats(slug: string): Promise<{
        requests: number;
        successRate: number;
    }>;
}

declare class ZpiClient {
    #private;
    readonly catalog: Catalog;
    constructor(options: ZpiClientOptions);
    run<T = unknown>(projectKey: string, endpoint: string, params?: Record<string, unknown>, opts?: RunOpts): Promise<T>;
    stream(projectKey: string, endpoint: string, params?: Record<string, unknown>, opts?: StreamOpts): AsyncIterable<StreamEvent>;
    toJSON(): Record<string, never>;
}

type HeaderBag = Headers | Record<string, string> | undefined;
declare class ZpiError extends Error {
    status: number;
    code?: string;
    raw: unknown;
    requestId?: string;
    constructor(message: string, status: number, raw: unknown, requestId?: string);
}
declare class ZpiInvalidParamsError extends ZpiError {
    errors: Array<{
        path?: string;
        message?: string;
    }>;
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiExecError extends ZpiError {
    error: string;
    errors: unknown;
    context?: unknown;
    project?: string;
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiAuthError extends ZpiError {
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiPlanGateError extends ZpiError {
    requiredPlan?: string;
    upgradeUrl?: string;
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiNotFoundError extends ZpiError {
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiMethodNotAllowedError extends ZpiError {
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiRateLimitError extends ZpiError {
    limit?: number;
    used?: number;
    window?: "minute" | "month" | string;
    retryAfterSec?: number;
    retryAfter?: number;
    constructor(body: unknown, status: number, headers: HeaderBag, requestId?: string);
}
declare class ZpiServerError extends ZpiError {
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiDisabledError extends ZpiError {
    constructor(body: unknown, status: number, requestId?: string);
}
declare class ZpiNetworkError extends ZpiError {
    constructor(message: string, cause?: unknown);
}
declare class ZpiTimeoutError extends ZpiError {
    constructor(message: string, cause?: unknown);
}
declare class ZpiAbortError extends ZpiError {
    constructor(message: string, cause?: unknown);
}

declare const VERSION: "0.0.0";

export { type Catalog, type CatalogList, type CatalogListItem, type CatalogListOpts, type Category, type EndpointSchema, type RunOpts, type SchemaField, type ScraperDetail, type ScraperEndpoint, type ScraperMap, type ScraperResult, type SseEvent, type StreamEvent, type StreamOpts, VERSION, ZpiAbortError, ZpiAuthError, ZpiClient, type ZpiClientOptions, ZpiDisabledError, ZpiError, ZpiExecError, ZpiInvalidParamsError, ZpiMethodNotAllowedError, ZpiNetworkError, ZpiNotFoundError, ZpiPlanGateError, ZpiRateLimitError, ZpiServerError, ZpiTimeoutError };
