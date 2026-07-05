// Sync the VERSION literal in src/index.ts from package.json (runs after `changeset version`).
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const path = "src/index.ts";
const src = readFileSync(path, "utf8");
const next = src.replace(
	/export const VERSION = "[^"]*" as const;/,
	`export const VERSION = "${version}" as const;`
);
if (next === src && !src.includes(`"${version}"`)) {
	console.error("sync-version: VERSION line not found");
	process.exit(1);
}
writeFileSync(path, next);
console.log(`sync-version: VERSION → ${version}`);
