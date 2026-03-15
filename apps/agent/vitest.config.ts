import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      // Temporarily excluded: OOM crash on Node.js 25 with Vitest fork workers
      "src/indexer/chunker.test.ts",
      // Test repo with intentional bug — used as E2E fixture, not a real test suite
      "tests/e2e/test-repo/**",
    ],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
  },
});
