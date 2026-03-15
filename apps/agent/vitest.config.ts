import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      // Temporarily excluded: OOM crash on Node.js 25 with Vitest fork workers
      "src/indexer/chunker.test.ts",
    ],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
  },
});
