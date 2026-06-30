import { resolveConfig, type ZpiClientOptions } from "./core/config";
import type { ResolvedConfig } from "./core/config";
import { run, type RunOpts } from "./resources/exec";

export class ZpiClient {
  // Resolved config kept non-enumerable so JSON.stringify(client) never leaks the apiKey.
  readonly #config: ResolvedConfig;

  constructor(options: ZpiClientOptions) {
    this.#config = resolveConfig(options);
  }

  run<T = unknown>(
    projectKey: string,
    endpoint: string,
    params?: Record<string, unknown>,
    opts?: RunOpts
  ): Promise<T> {
    return run<T>(this.#config, projectKey, endpoint, params, opts);
  }

  // Explicit redaction so no config (and thus no apiKey) is ever serialized.
  toJSON(): Record<string, never> {
    return {};
  }
}
