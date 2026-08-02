import { resolveConfig, type ZpiClientOptions } from "./core/config";
import type { ResolvedConfig } from "./core/config";
import { run, type RunOpts, type ScraperParams } from "./resources/exec";
import {
  runStream,
  type StreamEvent,
  type StreamOpts,
} from "./resources/stream";
import { createCatalog, type Catalog } from "./resources/catalog";
import { createBulk, type Bulk } from "./resources/bulk";

export class ZpiClient {
  // Resolved config kept in a private field so JSON.stringify(client) never leaks the apiKey.
  readonly #config: ResolvedConfig;

  // No-auth public discovery namespace; holds config internally, never serialized.
  readonly catalog: Catalog;

  // Bulk submit + wait() namespace; closes over #config, never serialized.
  readonly bulk: Bulk;

  constructor(options: ZpiClientOptions) {
    this.#config = resolveConfig(options);
    this.catalog = createCatalog(this.#config);
    this.bulk = createBulk(this.#config);
  }

  // Adopt codegen's baked verb table (`import { ZPI_METHODS } from "./zpi-gen"`),
  // so every call goes out with the right method on the first request instead of
  // discovering it from a 405.
  useMethods(methods: Record<string, Record<string, string>>): this {
    for (const [projectKey, endpoints] of Object.entries(methods ?? {})) {
      for (const [endpoint, verb] of Object.entries(endpoints ?? {})) {
        const m = String(verb).toUpperCase();
        if (m === "GET" || m === "POST") {
          this.#config.methodMemo.set(`${projectKey}/${endpoint}`, m);
        }
      }
    }
    return this;
  }

  // K/E infer as literals so codegen-merged ScraperMap entries narrow `params`;
  // without codegen they collapse to string and params stays a plain record.
  run<T = unknown, K extends string = string, E extends string = string>(
    projectKey: K,
    endpoint: E,
    params?: ScraperParams<K, E>,
    opts?: RunOpts
  ): Promise<T> {
    return run<T>(
      this.#config,
      projectKey,
      endpoint,
      params as Record<string, unknown> | undefined,
      opts
    );
  }

  stream<K extends string = string, E extends string = string>(
    projectKey: K,
    endpoint: E,
    params?: ScraperParams<K, E>,
    opts?: StreamOpts
  ): AsyncIterable<StreamEvent> {
    return runStream(
      this.#config,
      projectKey,
      endpoint,
      params as Record<string, unknown> | undefined,
      opts
    );
  }

  // Explicit redaction so no config (and thus no apiKey) is ever serialized.
  toJSON(): Record<string, never> {
    return {};
  }
}
