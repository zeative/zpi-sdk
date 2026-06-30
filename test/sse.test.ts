import { describe, expect, it } from "vitest";
import { createSseParser } from "../src/core/sse";

describe("createSseParser", () => {
  it("parses a single data frame", () => {
    const p = createSseParser();
    expect(p.push("data: hello\n\n")).toEqual([{ data: "hello" }]);
  });

  it("joins multi-line data with newlines", () => {
    const p = createSseParser();
    expect(p.push("data: a\ndata: b\n\n")).toEqual([{ data: "a\nb" }]);
  });

  it("captures event and id fields", () => {
    const p = createSseParser();
    expect(p.push("event: ping\nid: 7\ndata: x\n\n")).toEqual([
      { event: "ping", id: "7", data: "x" },
    ]);
  });

  it("ignores comment lines and yields nothing for comment-only frames", () => {
    const p = createSseParser();
    expect(p.push(": keep-alive\n\n")).toEqual([]);
  });

  it("buffers a frame split across chunks", () => {
    const p = createSseParser();
    expect(p.push("data: par")).toEqual([]);
    expect(p.push("tial\n\n")).toEqual([{ data: "partial" }]);
  });

  it("handles CRLF line endings", () => {
    const p = createSseParser();
    expect(p.push("data: x\r\n\r\n")).toEqual([{ data: "x" }]);
  });

  it("strips one leading space, preserves a second", () => {
    const p = createSseParser();
    expect(p.push("data:  x\n\n")).toEqual([{ data: " x" }]);
  });

  it("flushes a buffered unterminated event at EOF", () => {
    const p = createSseParser();
    expect(p.push("data: tail\n")).toEqual([]);
    expect(p.flush()).toEqual([{ data: "tail" }]);
  });

  it("flush yields nothing when buffer has no data", () => {
    const p = createSseParser();
    expect(p.flush()).toEqual([]);
  });

  it("returns two events from two frames in one push", () => {
    const p = createSseParser();
    expect(p.push("data: a\n\ndata: b\n\n")).toEqual([
      { data: "a" },
      { data: "b" },
    ]);
  });

  it("parses a realistic BE encodeChunk JSON frame", () => {
    const p = createSseParser();
    expect(p.push('data: {"x":1}\n\n')).toEqual([{ data: '{"x":1}' }]);
  });

  it("splits a realistic BE frame in two halves (mid-frame buffering)", () => {
    const p = createSseParser();
    expect(p.push('data: {"x":')).toEqual([]);
    expect(p.push('1}\n\n')).toEqual([{ data: '{"x":1}' }]);
  });
});
