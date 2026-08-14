/// <reference types="node" />
// Source scanning for `zpi codegen --scan`. Node-only, like the rest of ./codegen.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIR = /^(?:node_modules|dist|build|out|coverage|\.git|\.next|\.turbo)$/;

// `client.run("category:scraper", "endpoint", …)` / `.stream(…)`, single or double quoted.
// Only literal arguments are matched — a variable endpoint cannot be resolved statically.
const CALL =
	/\.(?:run|stream)\s*<[^>]*>\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]+)\3|\.(?:run|stream)\s*\(\s*(['"`])([^'"`]+)\5\s*,\s*(['"`])([^'"`]+)\7/g;

/** Which endpoints of which scrapers a codebase actually calls. */
export type ScanHits = Map<string, Set<string>>;

function walk(dir: string, out: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of entries) {
		if (SKIP_DIR.test(name)) continue;
		const full = join(dir, name);
		let isDir: boolean;
		try {
			isDir = statSync(full).isDirectory();
		} catch {
			continue;
		}
		if (isDir) walk(full, out);
		else if (SOURCE_FILE.test(name)) out.push(full);
	}
}

/** `resolve/:url` and `resolve` are the same endpoint; the catalog knows it as the bare slug. */
function baseSlug(endpoint: string): string {
	const cut = endpoint.indexOf("/");
	return cut === -1 ? endpoint : endpoint.slice(0, cut);
}

export function scanSource(dir: string): ScanHits {
	const files: string[] = [];
	walk(dir, files);

	const hits: ScanHits = new Map();
	for (const file of files) {
		let text: string;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		CALL.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = CALL.exec(text)) !== null) {
			const projectKey = match[2] ?? match[6];
			const endpoint = match[4] ?? match[8];
			if (!projectKey || !endpoint) continue;
			const endpoints = hits.get(projectKey) ?? new Set<string>();
			endpoints.add(baseSlug(endpoint));
			hits.set(projectKey, endpoints);
		}
	}
	return hits;
}

/** A scanned key may be `category:scraper` or the legacy bare `scraper`. */
export function hitEndpoints(
	hits: ScanHits,
	category: string,
	slug: string
): Set<string> | undefined {
	return hits.get(`${category}:${slug}`) ?? hits.get(slug);
}
