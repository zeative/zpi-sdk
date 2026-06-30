export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
}

export function createSseParser(): {
  push(text: string): SseEvent[];
  flush(): SseEvent[];
} {
  let buf = "";
  let dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let hasData = false;

  function reset() {
    dataLines = [];
    event = undefined;
    id = undefined;
    hasData = false;
  }

  // Dispatch the accumulated frame; only emits when it carried `data:` lines.
  function dispatch(): SseEvent | null {
    if (!hasData) {
      reset();
      return null;
    }
    const ev: SseEvent = { data: dataLines.join("\n") };
    if (event !== undefined) ev.event = event;
    if (id !== undefined) ev.id = id;
    reset();
    return ev;
  }

  function handleLine(rawLine: string, out: SseEvent[]) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      const ev = dispatch();
      if (ev) out.push(ev);
      return;
    }
    if (line.startsWith(":")) return; // comment
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1); // strip one leading space
    if (field === "data") {
      dataLines.push(value);
      hasData = true;
    } else if (field === "event") {
      event = value;
    } else if (field === "id") {
      id = value;
    }
  }

  return {
    push(text: string): SseEvent[] {
      buf += text;
      const out: SseEvent[] = [];
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const rawLine = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handleLine(rawLine, out);
      }
      return out;
    },
    flush(): SseEvent[] {
      const out: SseEvent[] = [];
      if (buf !== "") {
        handleLine(buf, out);
        buf = "";
      }
      const ev = dispatch();
      if (ev) out.push(ev);
      return out;
    },
  };
}
