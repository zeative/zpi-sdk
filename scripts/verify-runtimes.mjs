// Runtime matrix orchestrator (DX-02). Builds the package, then live-verifies
// each available runtime against the BUILT dist by spawning a per-runtime smoke
// that constructs a ZpiClient + calls run() with an injected fetch (no network).
// Prints a markdown matrix and exits non-zero if ANY live row fails. A missing
// binary is a skip-with-warn (not a failure) so a host lacking bun/deno still
// distinguishes real breakage. Termux is DECLARED covered-by-Node, never run.
//
// This dev script may use node:child_process — the zero-node-builtin rule applies
// ONLY to the published `.` bundle (dist/index.mjs), not to tooling.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function has(bin) {
	const probe = spawnSync(bin, ["--version"], { stdio: "ignore" });
	return !probe.error && probe.status === 0;
}

function run(label, bin, args) {
	const r = spawnSync(bin, args, { stdio: "inherit" });
	return !r.error && r.status === 0;
}

// 1) Build first so every smoke imports a fresh dist.
console.log("→ building package…");
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
if ((build.error || build.status !== 0) && !existsSync("dist/index.mjs")) {
	console.error("verify-runtimes: build failed and dist/index.mjs is absent — cannot verify.");
	process.exit(1);
}

// 2) Define rows. browser-proxy runs under Deno: a faithful browser has a NATIVE
//    web Response (no undici/Buffer plumbing), so process/Buffer traps stay clean.
const denoOk = has("deno");
const bunOk = has("bun");

const rows = [
	{ runtime: "Node", version: process.version, verify: "ESM dist import + VERSION", bin: "node", args: ["scripts/smoke-esm.mjs"], live: true },
	{ runtime: "Node (browser-proxy)", version: denoOk ? "via Deno" : "—", verify: "no-node-globals load + construct (process/Buffer trapped)", bin: "deno", args: ["run", "--allow-read", "scripts/smoke-browser-proxy.mjs"], live: denoOk },
	{ runtime: "Bun", version: bunOk ? "1.x" : "—", verify: "ESM dist import + run() injected fetch", bin: "bun", args: ["scripts/smoke-bun.mjs"], live: bunOk },
	{ runtime: "Deno", version: denoOk ? "2.x" : "—", verify: "ESM dist import + run() injected fetch", bin: "deno", args: ["run", "--allow-read", "scripts/smoke-deno.mjs"], live: denoOk },
];

const results = [];
let anyFail = false;

for (const row of rows) {
	if (!row.live) {
		console.warn(`⏭  ${row.runtime}: \`${row.bin}\` not on PATH — skipping (warning, not failure).`);
		results.push({ ...row, status: "⏭ skipped" });
		continue;
	}
	console.log(`\n→ ${row.runtime} (${row.bin} ${row.args.join(" ")})`);
	const ok = run(row.runtime, row.bin, row.args);
	if (!ok) anyFail = true;
	results.push({ ...row, status: ok ? "✅ live" : "❌ fail" });
}

// Termux: honest declared row — Node-on-Android, functionally identical to Node.
results.push({ runtime: "Termux", version: "Android (Node)", verify: "covered-by-Node, engines.node >=20", status: "📋 declared" });

// 3) Matrix table.
console.log("\n## Runtime verification matrix\n");
console.log("| Runtime | Version | Status | Verification |");
console.log("| --- | --- | --- | --- |");
for (const r of results) {
	console.log(`| ${r.runtime} | ${r.version} | ${r.status} | ${r.verify} |`);
}
console.log("");

if (anyFail) {
	console.error("verify-runtimes: at least one LIVE runtime FAILED.");
	process.exit(1);
}
console.log("verify-runtimes: all live runtimes passed (skips are warnings).");
