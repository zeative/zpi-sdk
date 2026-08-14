import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    passWithNoTests: true,
    // Result narrowing is a compile-time promise, so it needs a compile-time assertion to hold.
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "tsconfig.test.json",
    },
  },
});
