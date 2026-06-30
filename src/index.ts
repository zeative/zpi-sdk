// Universal core entry. run() + client land in Phase 2; typed errors arrive in plan 02.
export const VERSION = "0.0.0" as const;

export { ZpiClient } from "./client";
export type { ZpiClientOptions } from "./core/config";
export type { RunOpts, ScraperMap } from "./resources/exec";
