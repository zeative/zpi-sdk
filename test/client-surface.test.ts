import { describe, expect, it } from "vitest";
import { ZpiClient } from "../src/client";
import type { StreamEvent } from "../src/resources/stream";
import type { SseEvent } from "../src/core/sse";

// Streamed Response from chunks (mirrors test/stream.test.ts helper).
function fakeStreamFetch(chunks: string[], contentType: string) {
  return (async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": contentType },
    });
  }) as unknown as typeof globalThis.fetch;
}

// {content,message,errors} envelope reply (mirrors test/catalog.test.ts helper).
function fakeContentFetch(content: unknown) {
  return (async () =>
    new Response(JSON.stringify({ content, message: "OK", errors: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
}

async function collect(it: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe("ZpiClient.stream", () => {
  it("yields SSE events off the client", async () => {
    const client = new ZpiClient({
      apiKey: "sekret",
      fetch: fakeStreamFetch(
        ['data: {"i":1}\n\n', 'data: {"i":2}\n\n'],
        "text/event-stream"
      ),
    });
    const out = (await collect(client.stream("c:s", "ep"))) as SseEvent[];
    expect(out.map((e) => e.data)).toEqual(['{"i":1}', '{"i":2}']);
  });
});

describe("ZpiClient.catalog", () => {
  it("categories() returns the array off the client", async () => {
    const cats = [{ slug: "social", displayName: "Social" }];
    const client = new ZpiClient({
      apiKey: "sekret",
      fetch: fakeContentFetch(cats),
    });
    const out = await client.catalog.categories();
    expect(out).toEqual(cats);
  });

  it("schema() returns {fields:[...]} off the client", async () => {
    const schema = {
      fields: [{ name: "mode", type: "string", required: true }],
    };
    const client = new ZpiClient({
      apiKey: "sekret",
      fetch: fakeContentFetch(schema),
    });
    const out = await client.catalog.schema("acme", "run");
    expect(out.fields[0].name).toBe("mode");
  });
});

describe("ZpiClient serialization", () => {
  it("JSON.stringify(client) is {} and never leaks the apiKey", () => {
    const client = new ZpiClient({ apiKey: "sekret" });
    const json = JSON.stringify(client);
    expect(json).toBe("{}");
    expect(json).not.toContain("sekret");
  });
});
