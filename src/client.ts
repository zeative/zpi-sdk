import { resolveConfig, type ZpiClientOptions } from "./core/config";
import type { ResolvedConfig } from "./core/config";
import { run, type RunOpts } from "./resources/exec";
import {
  runStream,
  type StreamEvent,
  type StreamOpts,
} from "./resources/stream";
import { createCatalog, type Catalog } from "./resources/catalog";

export class ZpiClient {
  // Resolved config kept in a private field so JSON.stringify(client) never leaks the apiKey.
  readonly #config: ResolvedConfig;

  // No-auth public discovery namespace; holds config internally, never serialized.
  readonly catalog: Catalog;

  constructor(options: ZpiClientOptions) {
    this.#config = resolveConfig(options);
    this.catalog = createCatalog(this.#config);
  }

  run<T = unknown>(
    projectKey: string,
    endpoint: string,
    params?: Record<string, unknown>,
    opts?: RunOpts
  ): Promise<T> {
    return run<T>(this.#config, projectKey, endpoint, params, opts);
  }

  stream(
    projectKey: string,
    endpoint: string,
    params?: Record<string, unknown>,
    opts?: StreamOpts
  ): AsyncIterable<StreamEvent> {
    return runStream(this.#config, projectKey, endpoint, params, opts);
  }

  // Explicit redaction so no config (and thus no apiKey) is ever serialized.
  toJSON(): Record<string, never> {
    return {};
  }
}
