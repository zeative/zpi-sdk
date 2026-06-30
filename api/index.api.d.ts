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

declare class ZpiClient {
    #private;
    constructor(options: ZpiClientOptions);
    run<T = unknown>(projectKey: string, endpoint: string, params?: Record<string, unknown>, opts?: RunOpts): Promise<T>;
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

export { type RunOpts, type ScraperMap, type ScraperResult, VERSION, ZpiAbortError, ZpiAuthError, ZpiClient, type ZpiClientOptions, ZpiDisabledError, ZpiError, ZpiExecError, ZpiInvalidParamsError, ZpiMethodNotAllowedError, ZpiNetworkError, ZpiNotFoundError, ZpiPlanGateError, ZpiRateLimitError, ZpiServerError, ZpiTimeoutError };
