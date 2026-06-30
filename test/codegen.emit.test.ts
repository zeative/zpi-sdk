import { describe, expect, it } from "vitest";
import {
	type EmitScraper,
	emitParams,
	emitScraperMap,
	mapFieldType,
} from "../src/codegen/emit";

function field(over: Record<string, unknown>) {
	return { name: "x", type: "string", required: true, ...over } as never;
}

describe("mapFieldType base types", () => {
	it("string/url -> string", () => {
		expect(mapFieldType(field({ type: "string" }))).toBe("string");
		expect(mapFieldType(field({ type: "url" }))).toBe("string");
	});
	it("number/integer/float -> number", () => {
		expect(mapFieldType(field({ type: "number" }))).toBe("number");
		expect(mapFieldType(field({ type: "integer" }))).toBe("number");
		expect(mapFieldType(field({ type: "float" }))).toBe("number");
	});
	it("boolean/bool -> boolean", () => {
		expect(mapFieldType(field({ type: "boolean" }))).toBe("boolean");
		expect(mapFieldType(field({ type: "bool" }))).toBe("boolean");
	});
	it("array -> unknown[]", () => {
		expect(mapFieldType(field({ type: "array" }))).toBe("unknown[]");
	});
	it("object -> Record<string, unknown>", () => {
		expect(mapFieldType(field({ type: "object" }))).toBe(
			"Record<string, unknown>"
		);
	});
});

describe("mapFieldType unknown-type degrade", () => {
	it("unrecognized type -> unknown, never any", () => {
		const out = mapFieldType(field({ type: "wat" }));
		expect(out).toBe("unknown");
		expect(out).not.toBe("any");
	});
});

describe("mapFieldType enumValues union", () => {
	it("string enum -> quoted literal union", () => {
		expect(
			mapFieldType(field({ type: "string", enumValues: ["a", "b"] }))
		).toBe('"a" | "b"');
	});
	it("number enum -> bare numeric union, overriding base type", () => {
		expect(
			mapFieldType(field({ type: "number", enumValues: [1, 2] }))
		).toBe("1 | 2");
	});
});

describe("emitParams", () => {
	it("empty fields -> Record<string, unknown>, never any", () => {
		const out = emitParams([]);
		expect(out).toBe("Record<string, unknown>");
		expect(out).not.toContain("any");
	});
	it("required has no ?, optional has ?", () => {
		const out = emitParams([
			field({ name: "username", type: "string", required: true }),
			field({ name: "limit", type: "number", required: false }),
		]);
		expect(out).toContain("username: string");
		expect(out).toContain("limit?: number");
	});
});

describe("emitScraperMap", () => {
	const scrapers: EmitScraper[] = [
		{
			category: "social",
			scraper: "instagram",
			endpoints: [
				{
					slug: "profile",
					schema: {
						fields: [
							{ name: "username", type: "string", required: true },
						],
					},
				},
			],
		},
	];

	it("emits a declare module ScraperMap block with the entry", () => {
		const out = emitScraperMap(scrapers, {
			baseURL: "https://api.zpi.web.id",
		});
		expect(out).toContain('declare module "zpi-sdk"');
		expect(out).toContain("interface ScraperMap");
		expect(out).toContain('"social:instagram"');
		expect(out).toContain("profile:");
		expect(out).toContain("params:");
		expect(out).toContain("result: unknown");
	});

	it("header notes generated-by + the source baseURL", () => {
		const out = emitScraperMap(scrapers, {
			baseURL: "https://api.zpi.web.id",
		});
		expect(out.toLowerCase()).toContain("generated");
		expect(out).toContain("https://api.zpi.web.id");
	});

	it("never emits any anywhere", () => {
		const out = emitScraperMap(scrapers, {
			baseURL: "https://api.zpi.web.id",
		});
		expect(out).not.toMatch(/\bany\b/);
	});
});
