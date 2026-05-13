import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Node-only tests for server logic; UI/browser tests are out of scope for now.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    // Path alias mirrors tsconfig "~/*" → "src/*" so server-side imports resolve.
    alias: {
      "~": resolve(__dirname, "src"),
    },
  },
});
