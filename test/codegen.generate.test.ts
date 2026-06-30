import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generate } from "../src/codegen";

// Tests may use node builtins — they are not part of the bundled graph.
const tmpDirs: string[] = [];
function tmpOut(): string {
	const dir = mkdtempSync(join(tmpdir(), "zpi-codegen-"));
	tmpDirs.push(dir);
	return join(dir, "zpi-types.d.ts");
}

afterEach(() => {
	for (const d of tmpDirs.splice(0)) {
		rmSync(d, { recursive: true, force: true });
	}
});

const LIST_P1 = {
	items: [
		{ slug: "instagram", category: "social" },
		{ slug: "tiktok", category: "social" },
	],
	nextCursor: "c2",
	total: 3,
};
const LIST_P2 = {
	items: [{ slug: "loose", category: "misc" }],
	nextCursor: null,
	total: 3,
};
const DETAIL: Record<string, unknown> = {
	instagram: { endpoints: [{ slug: "profile" }] },
	tiktok: { endpoints: [{ slug: "video" }] },
	loose: { endpoints: [{ slug: "raw" }] },
};
const SCHEMA: Record<string, unknown> = {
	"instagram/profile": {
		fields: [
			{ name: "username", type: "string", required: true },
			{ name: "limit", type: "number", required: false },
			{
				name: "mode",
				type: "string",
				required: false,
				enumValues: ["a", "b"],
			},
		],
	},
	"tiktok/video": {
		fields: [{ name: "flag", type: "weirdtype", required: true }],
	},
	// loose/raw intentionally absent -> fixture throws.
};

function envelope(content: unknown): Response {
	return new Response(
		JSON.stringify({ content, message: "OK", errors: [] }),
		{ status: 200, headers: { "content-type": "application/json" } }
	);
}

// Fixture fetch mirroring test/catalog.test.ts envelope shape.
function fixtureFetch(): typeof globalThis.fetch {
	return (async (input: string | URL | Request) => {
		const url = String(input);
		const path = new URL(url);
		const p = path.pathname;
		const cursor = path.searchParams.get("cursor");

		if (p.endsWith("/api/scrapers/list")) {
			return envelope(cursor === "c2" ? LIST_P2 : LIST_P1);
		}
		const detailMatch = p.match(/\/api\/scrapers\/([^/]+)$/);
		if (detailMatch) {
			return envelope(DETAIL[detailMatch[1]]);
		}
		const schemaMatch = p.match(
			/\/api\/public\/scrapers\/([^/]+)\/endpoints\/([^/]+)\/schema$/
		);
		if (schemaMatch) {
			const key = `${schemaMatch[1]}/${schemaMatch[2]}`;
			if (!SCHEMA[key]) {
				throw new Error(`simulated schema fetch error for ${key}`);
			}
			return envelope(SCHEMA[key]);
		}
		throw new Error(`unexpected url: ${url}`);
	}) as typeof globalThis.fetch;
}

describe("generate()", () => {
	it("crawls paginated catalog, emits + writes a zero-import .d.ts", async () => {
		const out = tmpOut();
		const result = await generate({
			baseURL: "https://x.test",
			out,
			fetch: fixtureFetch(),
		});

		expect(result).toEqual({ written: out, scrapers: 3, endpoints: 3 });

		const src = readFileSync(out, "utf8");
		expect(src).toContain('declare module "zpi-sdk"');
		expect(src).toContain("interface ScraperMap");

		expect(src).toContain('"social:instagram"');
		expect(src).toContain("username: string");
		expect(src).toContain("limit?: number");
		expect(src).toMatch(/mode\?:\s*"a"\s*\|\s*"b"/);

		expect(src).toContain('"social:tiktok"');
		expect(src).toContain("flag: unknown");
		expect(src).not.toContain("flag: any");

		// throwing-schema degrade
		expect(src).toContain('"misc:loose"');
		expect(src).toContain("params: Record<string, unknown>");

		// result: unknown on every endpoint (3)
		const resultCount = (src.match(/result: unknown/g) ?? []).length;
		expect(resultCount).toBe(3);

		// NO runtime value import / require.
		for (const line of src.split("\n")) {
			expect(line).not.toMatch(/^import\s/);
			expect(line).not.toMatch(/require\(/);
		}
	});

	it("filter restricts which scrapers are emitted", async () => {
		const out = tmpOut();
		const result = await generate({
			baseURL: "https://x.test",
			out,
			fetch: fixtureFetch(),
			filter: "instagram",
		});

		expect(result).toEqual({ written: out, scrapers: 1, endpoints: 1 });
		const src = readFileSync(out, "utf8");
		expect(src).toContain('"social:instagram"');
		expect(src).not.toContain('"social:tiktok"');
		expect(src).not.toContain('"misc:loose"');
	});
});
