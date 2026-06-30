import { ZpiClient } from "../dist/index.mjs";

const RT = "bun";

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
		process.exit(1);
	}
	console.log(`${RT} smoke OK`);
} catch (e) {
	console.error(`${RT} smoke FAIL: ${e?.message ?? e}`);
	process.exit(1);
}
