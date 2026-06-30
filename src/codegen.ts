/// <reference types="node" />
// ./codegen entry — Node-only generator. fs/path live HERE (NOT in the `.` core
// bundle); the dist-scan only guards `.`, this `./codegen` entry may use builtins.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveConfig } from "./core/config";
import {
	type EmitScraper,
	emitScraperMap,
} from "./codegen/emit";
import {
	type Catalog,
	type EndpointSchema,
	createCatalog,
} from "./resources/catalog";

export interface GenerateOptions {
	baseURL: string;
	out: string;
	fetch?: typeof globalThis.fetch;
	filter?: string;
	key?: string;
}

export interface GenerateResult {
	written: string;
	scrapers: number;
	endpoints: number;
}

const SCHEMA_POOL = 5;

interface ScraperRef {
	slug: string;
	category: string;
}

// Walk the cursor-paginated catalog.list to enumerate every scraper.
async function enumerateScrapers(catalog: Catalog): Promise<ScraperRef[]> {
	const refs: ScraperRef[] = [];
	let cursor: string | undefined;
	do {
		const page = await catalog.list(cursor ? { cursor } : undefined);
		for (const item of page.items ?? []) {
			refs.push({ slug: item.slug, category: item.category });
		}
		cursor = page.nextCursor ?? undefined;
	} while (cursor);
	return refs;
}

function matchesFilter(ref: ScraperRef, filter: string): boolean {
	const needle = filter.toLowerCase();
	const composite = `${ref.category}:${ref.slug}`.toLowerCase();
	return (
		ref.slug.toLowerCase().includes(needle) ||
		ref.category.toLowerCase().includes(needle) ||
		composite.includes(needle)
	);
}

// Fetch one endpoint schema, degrading a throw/empty to {fields:[]} so a single
// bad endpoint never aborts the whole run (T-06-03).
async function fetchSchema(
	catalog: Catalog,
	slug: string,
	endpoint: string
): Promise<EndpointSchema> {
	try {
		const schema = await catalog.schema(slug, endpoint);
		if (!schema?.fields || schema.fields.length === 0) {
			return { fields: [] };
		}
		return schema;
	} catch {
		console.warn(
			`[zpi codegen] schema fetch failed for ${slug}/${endpoint} — degrading to Record<string, unknown>`
		);
		return { fields: [] };
	}
}

// Resolve tasks with a small fixed concurrency to avoid hammering the BE.
async function pooled<T, R>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	async function run(): Promise<void> {
		while (next < items.length) {
			const i = next++;
			out[i] = await worker(items[i]);
		}
	}
	const runners = Array.from(
		{ length: Math.min(limit, items.length) },
		() => run()
	);
	await Promise.all(runners);
	return out;
}

export async function generate(
	opts: GenerateOptions
): Promise<GenerateResult> {
	const config = resolveConfig({
		apiKey: opts.key ?? "codegen",
		baseURL: opts.baseURL,
		fetch: opts.fetch,
	});
	const catalog = createCatalog(config);

	let refs = await enumerateScrapers(catalog);
	if (opts.filter) {
		refs = refs.filter((r) => matchesFilter(r, opts.filter as string));
	}

	let endpointCount = 0;
	const scrapers: EmitScraper[] = [];
	for (const ref of refs) {
		const detail = await catalog.get(ref.slug);
		const epSlugs = (detail.endpoints ?? []).map((e) => e.slug);
		const schemas = await pooled(epSlugs, SCHEMA_POOL, (eslug) =>
			fetchSchema(catalog, ref.slug, eslug)
		);
		const endpoints = epSlugs.map((slug, i) => ({
			slug,
			schema: schemas[i],
		}));
		endpointCount += endpoints.length;
		scrapers.push({
			category: ref.category,
			scraper: ref.slug,
			endpoints,
		});
	}

	const source = emitScraperMap(scrapers, { baseURL: opts.baseURL });
	mkdirSync(dirname(opts.out), { recursive: true });
	writeFileSync(opts.out, source, "utf8");

	return {
		written: opts.out,
		scrapers: scrapers.length,
		endpoints: endpointCount,
	};
}
