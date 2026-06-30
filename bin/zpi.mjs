#!/usr/bin/env node
// Node-only `zpi codegen` bin: thin argv wrapper around the built ./codegen
// generate(). All real work (fetch/emit/fs) lives in dist/codegen.mjs.
import { pathToFileURL } from "node:url";

const DEFAULT_BASE = "https://api.zpi.web.id";
const DEFAULT_OUT = "./zpi-sdk.gen.d.ts";
const KNOWN_FLAGS = new Set(["base", "out", "filter", "key"]);

const USAGE =
	"usage: zpi codegen [--base <url>] [--out <path>] [--filter <cat|slug>] [--key <apiKey>]";

// Pure flag parser — no I/O — so it's unit-testable without spawning the bin.
export function parseArgs(argv) {
	const flags = {};
	let command = "codegen";
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok.startsWith("--")) {
			let name;
			let value;
			const eq = tok.indexOf("=");
			if (eq !== -1) {
				name = tok.slice(2, eq);
				value = tok.slice(eq + 1);
			} else {
				name = tok.slice(2);
				value = argv[++i];
			}
			if (!KNOWN_FLAGS.has(name) || value === undefined) {
				throw new Error(`unknown or malformed flag: ${tok}`);
			}
			flags[name] = value;
		} else {
			// first non-flag token is the subcommand (only `codegen` supported)
			command = tok;
		}
	}
	const base =
		flags.base ?? process.env.ZPI_BASE_URL ?? DEFAULT_BASE;
	const out = flags.out ?? DEFAULT_OUT;
	const resolved = { command, base, out };
	if (flags.filter !== undefined) resolved.filter = flags.filter;
	if (flags.key !== undefined) resolved.key = flags.key;
	return resolved;
}

async function main() {
	let parsed;
	try {
		parsed = parseArgs(process.argv.slice(2));
	} catch (err) {
		process.stderr.write(`${err.message}\n${USAGE}\n`);
		process.exit(2);
	}
	try {
		const { generate } = await import("../dist/codegen.mjs");
		const r = await generate({
			baseURL: parsed.base,
			out: parsed.out,
			filter: parsed.filter,
			key: parsed.key,
		});
		process.stdout.write(
			`zpi codegen: wrote ${r.written} (${r.scrapers} scrapers, ${r.endpoints} endpoints)\n`
		);
	} catch (err) {
		process.stderr.write(`zpi codegen failed: ${err.message}\n`);
		process.exit(1);
	}
}

// Only run when executed directly — importing this file (tests) is side-effect free.
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
