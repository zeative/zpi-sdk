import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hitEndpoints, scanSource } from "../src/codegen/scan";

describe("scanSource", () => {
	let dir: string;
	beforeEach(async () => {
		dir = path.join(os.tmpdir(), `zpi-scan-${randomBytes(6).toString("hex")}`);
		await fs.mkdir(path.join(dir, "nested"), { recursive: true });
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const write = (rel: string, body: string) =>
		fs.writeFile(path.join(dir, rel), body, "utf8");

	it("finds a run() call and records its endpoint", async () => {
		await write("a.ts", `await client.run("temp-mail:mail-gw", "create")`);
		const hits = scanSource(dir);
		expect(hits.get("temp-mail:mail-gw")).toEqual(new Set(["create"]));
	});

	it("collects every endpoint of the same scraper", async () => {
		await write("a.ts", `client.run("temp-mail:mail-gw", "create")`);
		await write("nested/b.ts", `client.run("temp-mail:mail-gw", "inbox", { address })`);
		expect(scanSource(dir).get("temp-mail:mail-gw")).toEqual(
			new Set(["create", "inbox"])
		);
	});

	it("accepts single, double and back quotes", async () => {
		await write("a.ts", `client.run('a:b', 'one')`);
		await write("nested/c.js", "client.run(`c:d`, `two`)");
		const hits = scanSource(dir);
		expect(hits.get("a:b")).toEqual(new Set(["one"]));
		expect(hits.get("c:d")).toEqual(new Set(["two"]));
	});

	it("reduces a path-param endpoint to the slug the catalog knows", async () => {
		await write("a.ts", `client.run("bypass-tools:encurtador", "resolve/:url", { url })`);
		expect(scanSource(dir).get("bypass-tools:encurtador")).toEqual(
			new Set(["resolve"])
		);
	});

	it("picks up stream() as well as run()", async () => {
		await write("a.ts", `for await (const e of client.stream("x:y", "live")) {}`);
		expect(scanSource(dir).get("x:y")).toEqual(new Set(["live"]));
	});

	it("still matches when an explicit type argument is present", async () => {
		await write("a.ts", `client.run<"x:y", "z">("x:y", "z")`);
		expect(scanSource(dir).get("x:y")).toEqual(new Set(["z"]));
	});

	it("skips node_modules and build output", async () => {
		await fs.mkdir(path.join(dir, "node_modules"), { recursive: true });
		await fs.mkdir(path.join(dir, "dist"), { recursive: true });
		await write("node_modules/dep.ts", `client.run("vendor:pkg", "nope")`);
		await write("dist/bundle.js", `client.run("built:thing", "nope")`);
		expect(scanSource(dir).size).toBe(0);
	});

	it("ignores files that are not source", async () => {
		await write("readme.md", `client.run("docs:only", "nope")`);
		expect(scanSource(dir).size).toBe(0);
	});

	it("cannot resolve a non-literal endpoint, and says so by omitting it", async () => {
		await write("a.ts", `client.run("x:y", endpointVariable)`);
		expect(scanSource(dir).size).toBe(0);
	});

	it("returns an empty map for a directory that does not exist", () => {
		expect(scanSource(path.join(dir, "missing")).size).toBe(0);
	});
});

describe("hitEndpoints", () => {
	const hits = new Map([
		["temp-mail:mail-gw", new Set(["create"])],
		["legacy-slug", new Set(["only"])],
	]);

	it("matches a category:scraper key", () => {
		expect(hitEndpoints(hits, "temp-mail", "mail-gw")).toEqual(new Set(["create"]));
	});

	it("matches the legacy bare slug too", () => {
		expect(hitEndpoints(hits, "anything", "legacy-slug")).toEqual(new Set(["only"]));
	});

	it("returns undefined for a scraper nobody calls", () => {
		expect(hitEndpoints(hits, "finance", "goldprice")).toBeUndefined();
	});
});
