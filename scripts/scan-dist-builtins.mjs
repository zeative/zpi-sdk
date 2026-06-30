// Keystone gate: BANS node built-ins from the isomorphic `.` core bundle.
// Scans ONLY dist/index.{mjs,cjs} — codegen/bin are Node-only by design and exempt.
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";

const TARGETS = ["dist/index.mjs", "dist/index.cjs"];

// Longest-first so e.g. "stream/promises" matches before "stream".
const names = [...builtinModules].sort((a, b) => b.length - a.length);
const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));
const bareList = escaped.join("|");

// Catch import/require of any builtin in bare OR node:-prefixed form,
// plus a generic `node:` specifier prefix (covers future/unlisted builtins).
const patterns = [
	new RegExp(`(?:from|import|require)\\s*\\(?\\s*["'](?:node:)?(?:${bareList})(?:/[^"']*)?["']`, "g"),
	/(?:from|import|require)\s*\(?\s*["']node:[^"']+["']/g,
];

let failed = false;

for (const file of TARGETS) {
	let src;
	try {
		src = readFileSync(file, "utf8");
	} catch {
		console.error(`dist node-builtin scan: missing ${file} — run the build first`);
		process.exit(1);
	}
	for (const re of patterns) {
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(src)) !== null) {
			console.error(`dist node-builtin scan: FAIL — ${file} imports node builtin via ${m[0]}`);
			failed = true;
		}
	}
}

if (failed) {
	console.error("The `.` core must stay zero-dep/isomorphic — no node builtins allowed.");
	process.exit(1);
}

console.log("dist node-builtin scan: clean");
