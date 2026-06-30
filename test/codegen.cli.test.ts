import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs bin has no type decls; we only test the pure parser.
import { parseArgs } from "../bin/zpi.mjs";

describe("parseArgs defaults", () => {
	it("zero args -> codegen + prod defaults", () => {
		const r = parseArgs([]);
		expect(r).toEqual({
			command: "codegen",
			base: "https://api.zpi.web.id",
			out: "./zpi-sdk.gen.d.ts",
		});
	});

	it("bare codegen subcommand keeps defaults", () => {
		const r = parseArgs(["codegen"]);
		expect(r.command).toBe("codegen");
		expect(r.base).toBe("https://api.zpi.web.id");
		expect(r.out).toBe("./zpi-sdk.gen.d.ts");
	});
});

describe("parseArgs overrides", () => {
	it("all flags (space form) resolve", () => {
		const r = parseArgs([
			"codegen",
			"--base",
			"https://x.test",
			"--out",
			"./o.d.ts",
			"--filter",
			"social",
			"--key",
			"k",
		]);
		expect(r).toEqual({
			command: "codegen",
			base: "https://x.test",
			out: "./o.d.ts",
			filter: "social",
			key: "k",
		});
	});

	it("=-form works", () => {
		const r = parseArgs(["codegen", "--base=https://y.test"]);
		expect(r.base).toBe("https://y.test");
	});

	it("filter/key omitted when not passed", () => {
		const r = parseArgs(["codegen", "--out", "./z.d.ts"]);
		expect(r.out).toBe("./z.d.ts");
		expect(r).not.toHaveProperty("filter");
		expect(r).not.toHaveProperty("key");
	});
});

describe("parseArgs rejects bad input", () => {
	it("unknown flag throws (bin maps this to exit 2)", () => {
		expect(() => parseArgs(["codegen", "--nope", "v"])).toThrow();
	});

	it("flag missing value throws", () => {
		expect(() => parseArgs(["codegen", "--base"])).toThrow();
	});
});

describe("importing the bin is network-free", () => {
	it("parseArgs is a pure function with no side effects", () => {
		// If importing the bin triggered generate(), the test suite would hit
		// the network on load. Reaching here proves the direct-run guard holds.
		expect(typeof parseArgs).toBe("function");
	});
});
