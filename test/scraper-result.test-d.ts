import { describe, expectTypeOf, it } from "vitest";
import { ZpiClient } from "../src/index";

// What a consumer writes by hand when they want a result typed. Codegen never emits `result` —
// a scraper's response shape is the upstream site's, not something zpi can promise.
declare module "../src/resources/exec" {
	interface ScraperMap {
		"temp-mail:mail-gw": {
			create: {
				params: Record<string, unknown>;
				result: { address: string; durationMinutes: number };
			};
			inbox: { params: { address: string } };
		};
	}
}

const client = new ZpiClient({ apiKey: "zpi_test" });

// `expectTypeOf(x).toBeAny` is a bare property access and asserts nothing, so use the standard
// IsAny idiom: only `any` distributes into both branches of `0 extends 1 & T`.
type IsAny<T> = 0 extends 1 & T ? true : false;

describe("run() result typing", () => {
	it("uses the result a consumer declared", async () => {
		const mail = await client.run("temp-mail:mail-gw", "create");
		expectTypeOf(mail).toEqualTypeOf<{ address: string; durationMinutes: number }>();
	});

	it("stays any for an entry that declares params but no result", async () => {
		const inbox = await client.run("temp-mail:mail-gw", "inbox", {
			address: "a@b.com",
		});
		expectTypeOf<IsAny<typeof inbox>>().toEqualTypeOf<true>();
	});

	it("stays any for a scraper nobody has declared", async () => {
		const other = await client.run("finance:goldprice", "latest");
		expectTypeOf<IsAny<typeof other>>().toEqualTypeOf<true>();
	});

	it("still narrows params from a merged entry", () => {
		expectTypeOf(client.run<"temp-mail:mail-gw", "inbox">)
			.parameter(2)
			.toEqualTypeOf<{ address: string } | undefined>();
	});

	it("lets an annotation type the result at the call site", async () => {
		const typed: { custom: boolean } = await client.run("finance:goldprice", "latest");
		expectTypeOf(typed).toEqualTypeOf<{ custom: boolean }>();
	});
});
