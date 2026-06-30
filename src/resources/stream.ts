// runStream() — async-iterable streaming for X-Cache: SKIP-STREAM endpoints.
// Reads the body via getReader() (PITFALLS #5: `for await...of body` breaks
// browser/Safari) THROUGH the single core/http seam; web-standard only.
import type { ResolvedConfig } from "../core/config";
import { requestStream, type ReqDescriptor } from "../core/http";
import { createSseParser, type SseEvent } from "../core/sse";

// Mirrors RunOpts minus idempotencyKey — streams aren't retried.
export interface StreamOpts {
  method?: "GET" | "POST";
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  pathRest?: string;
}

// text/event-stream → parsed SseEvent; otherwise raw decoded text chunks.
export type StreamEvent = SseEvent | string;

export async function* runStream(
  config: ResolvedConfig,
  projectKey: string,
  endpoint: string,
  params?: Record<string, unknown>,
  opts?: StreamOpts
): AsyncGenerator<StreamEvent> {
  const descriptor: ReqDescriptor = {
    projectKey,
    endpoint,
    method: opts?.method ?? "POST",
    params,
    headers: opts?.headers,
    pathRest: opts?.pathRest,
    signal: opts?.signal,
    timeoutMs: opts?.timeoutMs,
  };

  const { contentType, reader } = await requestStream(config, descriptor);
  const isSse = contentType.includes("text/event-stream");
  const decoder = new TextDecoder();
  const parser = isSse ? createSseParser() : undefined;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (parser) {
        for (const ev of parser.push(text)) yield ev;
      } else if (text) {
        yield text;
      }
    }
    if (parser) {
      const tail = decoder.decode();
      if (tail) for (const ev of parser.push(tail)) yield ev;
      for (const ev of parser.flush()) yield ev;
    } else {
      const tail = decoder.decode();
      if (tail) yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}
