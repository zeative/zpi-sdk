import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/mcp.ts", "src/codegen.ts", "src/webhooks.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  target: "es2022",
  // Universal/isomorphic core — no node/browser globals injected (the critical flip vs node).
  platform: "neutral",

  tsconfig: "./tsconfig.build.json",

  dts: true,
  // No sourcemaps in the published package — they reference src/ (not published).
  sourcemap: false,
  treeshake: true,
  splitting: false,
  minify: true,
  clean: true,
  shims: false,

  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".mjs" };
  },
});
