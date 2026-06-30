// Runtime confirmation complementing scan-dist-builtins.mjs: load the published
// `.` bundle under a no-node-globals context with process/Buffer trapped as
// throwing Proxies. If the bundle touches them at import/construct/run, we fail.
//
// MUST run under a runtime with a NATIVE web `Response` (Deno/browser), NOT Node:
// Node's `Response.json()` is backed by undici, whose lazy dispatcher references
// `globalThis.Buffer` — a host-impl detail, not the SDK. A real browser has a
// native Response that never touches Buffer, so Deno is the faithful proxy here.
// The orchestrator spawns this via `deno run --allow-read`.
const RT = "browser-proxy";

const origProcess = globalThis.process;
const origBuffer = globalThis.Buffer;

const trap = (name) =>
	new Proxy(function () {}, {
		get() {
			throw new Error(`node global accessed: ${name}`);
		},
		apply() {
			throw new Error(`node global accessed: ${name}()`);
		},
		construct() {
			throw new Error(`node global accessed: new ${name}`);
		},
	});

const fakeFetch = async () =>
	new Response(
		JSON.stringify({ project: "demo:x", data: { ok: true }, timestamp: Date.now() }),
		{ status: 200, headers: { "content-type": "application/json" } },
	);

let failed = false;
try {
	globalThis.process = trap("process");
	globalThis.Buffer = trap("Buffer");

	const { ZpiClient } = await import("../dist/index.mjs");
	const client = new ZpiClient({ apiKey: "dummy", fetch: fakeFetch });
	const out = await client.run("demo:x", "ping", {}, { method: "GET" });
	if (!out || out.ok !== true || Object.keys(out).length !== 1) {
		console.error(`${RT} smoke FAIL: expected { ok: true }, got ${JSON.stringify(out)}`);
		failed = true;
	}
} catch (e) {
	console.error(`${RT} smoke FAIL: ${e?.message ?? e}`);
	failed = true;
} finally {
	globalThis.process = origProcess;
	globalThis.Buffer = origBuffer;
}

if (failed) {
	if (typeof process !== "undefined") process.exit(1);
	else if (typeof Deno !== "undefined") Deno.exit(1);
}
console.log(`${RT} smoke OK`);
