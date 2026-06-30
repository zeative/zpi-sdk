// Stale-README guard: every Zpi* identifier used in a README ```ts code block
// must be a real named export of the built dist. Catches invented/renamed APIs.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const sdk = await import(resolve(root, "dist/index.mjs"));
const exported = new Set(Object.keys(sdk));

const readme = await readFile(resolve(root, "README.md"), "utf8");

// Extract ```ts (or ```typescript) fenced blocks only — prose tables are not checked.
const blocks = [...readme.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)].map(
  (m) => m[1]
);

const found = new Set();
for (const block of blocks) {
  for (const m of block.matchAll(/\bZpi[A-Za-z]+\b/g)) {
    found.add(m[0]);
  }
}

const missing = [...found].filter((name) => !exported.has(name)).sort();

if (missing.length > 0) {
  console.error("check-readme-symbols: README references symbols NOT exported by dist:");
  for (const name of missing) console.error("  - " + name);
  console.error(
    "\nExported Zpi* names:\n  " +
      [...exported].filter((n) => /^Zpi/.test(n)).sort().join("\n  ")
  );
  process.exit(1);
}

console.log(
  `check-readme-symbols: OK — ${found.size} Zpi* identifier(s) in README, all exported.`
);
