import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/core/config";
import { ZpiPlanGateError } from "../src/core/errors";
import { runStream, type StreamEvent } from "../src/resources/stream";
import type { SseEvent } from "../src/core/sse";

// Build a fake fetch returning a streamed Response from the given chunks.
function fakeStreamFetch(
  chunks: string[],
  contentType: string,
  status = 200,
  errorBody?: unknown
) {
  return async () => {
    if (status >= 400) {
      return new Response(JSON.stringify(errorBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    return new Response(body, {
      status,
      headers: { "content-type": contentType },
    });
  };
}

function makeConfig(fetch: typeof globalThis.fetch) {
  return resolveConfig({ apiKey: "k", fetch });
}

async function collect(it: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe("runStream", () => {
  it("parses SSE frames arriving across pulls", async () => {
    const f = fakeStreamFetch(
      ['data: {"i":1}\n\n', 'data: {"i":2}\n\n'],
      "text/event-stream"
    ) as unknown as typeof globalThis.fetch;
    const out = (await collect(
      runStream(makeConfig(f), "cat:s", "ep")
    )) as SseEvent[];
    expect(out.map((e) => e.data)).toEqual(['{"i":1}', '{"i":2}']);
  });

  it("yields one event when a single frame is split across enqueues", async () => {
    const f = fakeStreamFetch(
      ["data: par", "tial\n\n"],
      "text/event-stream"
    ) as unknown as typeof globalThis.fetch;
    const out = (await collect(
      runStream(makeConfig(f), "cat:s", "ep")
    )) as SseEvent[];
    expect(out).toHaveLength(1);
    expect(out[0].data).toBe("partial");
  });

  it("yields raw decoded text chunks for non-event-stream content", async () => {
    const f = fakeStreamFetch(
      ["ab", "cd"],
      "text/plain"
    ) as unknown as typeof globalThis.fetch;
    const out = await collect(runStream(makeConfig(f), "cat:s", "ep"));
    expect(out).toEqual(["ab", "cd"]);
  });

  it("surfaces a pre-stream non-2xx as a typed ZpiError", async () => {
    const planGate = {
      error: { message: "Upgrade required", code: "plan_gate" },
      required_plan: "pro",
    };
    const f = fakeStreamFetch(
      [],
      "application/json",
      403,
      planGate
    ) as unknown as typeof globalThis.fetch;
    await expect(
      (async () => {
        for await (const _ of runStream(makeConfig(f), "cat:s", "ep")) {
          // drain
        }
      })()
    ).rejects.toBeInstanceOf(ZpiPlanGateError);
  });
});
