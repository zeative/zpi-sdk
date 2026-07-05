import { R as ResolvedConfig, Z as ZpiClientOptions } from './errors-BX0OR4LA.js';
export { a as ZpiAbortError, b as ZpiAuthError, c as ZpiBulkCapError, d as ZpiBulkNotEnabledError, e as ZpiDisabledError, f as ZpiError, g as ZpiExecError, h as ZpiIdempotencyError, i as ZpiInvalidParamsError, j as ZpiMethodNotAllowedError, k as ZpiNetworkError, l as ZpiNotFoundError, m as ZpiPlanGateError, n as ZpiRateLimitError, o as ZpiServerError, p as ZpiTimeoutError } from './errors-BX0OR4LA.js';

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
type ScraperParams<K extends string, E extends string> = K extends keyof ScraperMap ? E extends keyof ScraperMap[K] ? ScraperMap[K][E] extends {
    params: infer P;
} ? P : Record<string, unknown> : Record<string, unknown> : Record<string, unknown>;

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

type BulkJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
type BulkItemStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
interface BulkItem {
    url?: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
}
interface BulkItemResult {
    url?: string;
    params?: Record<string, unknown>;
    status: BulkItemStatus;
    data?: unknown;
    error?: unknown;
    latencyMs?: number;
}
interface BulkJobData {
    jobId: string;
    status: BulkJobStatus;
    total: number;
    succeeded?: number;
    failed?: number;
    scraperSlug?: string;
    endpointSlug?: string;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    pollUrl?: string;
    items?: BulkItemResult[];
}
interface BulkSubmitOpts {
    idempotencyKey?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    headers?: Record<string, string>;
}
interface BulkWaitOpts {
    signal?: AbortSignal;
    timeoutMs?: number;
    pollIntervalMs?: number;
    onProgress?: (job: BulkJobData) => void;
}
declare class BulkJob {
    readonly jobId: string;
    readonly pollUrl?: string;
    readonly status?: BulkJobStatus;
    readonly total?: number;
    private readonly config;
    constructor(config: ResolvedConfig, body: Record<string, unknown>);
    wait(opts?: BulkWaitOpts): Promise<BulkJobData>;
}
interface Bulk {
    submit(projectKey: string, endpoint: string, items: BulkItem[], opts?: BulkSubmitOpts): Promise<BulkJob>;
    status(jobId: string, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<BulkJobData>;
}

declare class ZpiClient {
    #private;
    readonly catalog: Catalog;
    readonly bulk: Bulk;
    constructor(options: ZpiClientOptions);
    run<T = unknown, K extends string = string, E extends string = string>(projectKey: K, endpoint: E, params?: ScraperParams<K, E>, opts?: RunOpts): Promise<T>;
    stream<K extends string = string, E extends string = string>(projectKey: K, endpoint: E, params?: ScraperParams<K, E>, opts?: StreamOpts): AsyncIterable<StreamEvent>;
    toJSON(): Record<string, never>;
}

declare const VERSION: "0.1.1";

export { type Bulk, type BulkItem, type BulkItemResult, type BulkItemStatus, BulkJob, type BulkJobData, type BulkJobStatus, type BulkSubmitOpts, type BulkWaitOpts, type Catalog, type CatalogList, type CatalogListItem, type CatalogListOpts, type Category, type EndpointSchema, type RunOpts, type SchemaField, type ScraperDetail, type ScraperEndpoint, type ScraperMap, type ScraperParams, type ScraperResult, type SseEvent, type StreamEvent, type StreamOpts, VERSION, ZpiClient, ZpiClientOptions };
