import { ZpiClient } from "../dist/index.mjs";

const RT = "deno";

const fakeFetch = async () =>
	new Response(
		JSON.stringify({ project: "demo:x", data: { ok: true }, timestamp: Date.now() }),
		{ status: 200, headers: { "content-type": "application/json" } },
	);

try {
	const client = new ZpiClient({ apiKey: "dummy", fetch: fakeFetch });
	const out = await client.run("demo:x", "ping", {}, { method: "GET" });
	if (!out || out.ok !== true || Object.keys(out).length !== 1) {
		console.error(`${RT} smoke FAIL: expected { ok: true }, got ${JSON.stringify(out)}`);
		Deno.exit(1);
	}
	console.log(`${RT} smoke OK`);
} catch (e) {
	console.error(`${RT} smoke FAIL: ${e?.message ?? e}`);
	Deno.exit(1);
}
