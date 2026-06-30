// DX-03: type-surface snapshot. Diffs built dist/index.d.ts vs committed
// api/index.api.d.ts so any public-type change is forced through a conscious
// semver/changeset decision. Node-only dev script (exempt from dist-scan).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BUILT = "dist/index.d.ts";
const BASELINE = "api/index.api.d.ts";

const mode = process.argv.includes("--write")
	? "write"
	: process.argv.includes("--check")
		? "check"
		: null;

if (!mode) {
	console.error("usage: snapshot-types.mjs --write | --check");
	process.exit(1);
}

if (!existsSync(BUILT)) {
	console.error(`type-snapshot: missing ${BUILT} — run the build first`);
	process.exit(1);
}

const norm = (s) => s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "") + "\n";

const current = norm(readFileSync(BUILT, "utf8"));

if (mode === "write") {
	mkdirSync(dirname(BASELINE), { recursive: true });
	writeFileSync(BASELINE, current);
	console.log(`type-snapshot: baseline written → ${BASELINE}`);
	process.exit(0);
}

if (!existsSync(BASELINE)) {
	console.error(`type-snapshot: missing baseline ${BASELINE} — run \`npm run types:snapshot\``);
	process.exit(1);
}

const baseline = norm(readFileSync(BASELINE, "utf8"));

if (baseline === current) {
	console.log("type-snapshot: public type surface unchanged");
	process.exit(0);
}

// Minimal unified-ish line diff.
const a = baseline.split("\n");
const b = current.split("\n");
const max = Math.max(a.length, b.length);
console.error(`type-snapshot: FAIL — ${BUILT} differs from ${BASELINE}`);
for (let i = 0; i < max; i++) {
	if (a[i] !== b[i]) {
		if (a[i] !== undefined) console.error(`  - ${a[i]}`);
		if (b[i] !== undefined) console.error(`  + ${b[i]}`);
	}
}
console.error("\nIf intentional: run `npm run types:snapshot` and add a changeset (major if breaking).");
process.exit(1);
