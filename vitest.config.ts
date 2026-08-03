import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    maxWorkers: Math.min(2, Math.max(availableParallelism() - 1, 1)),
    setupFiles: ["packages/ui/test/setup.ts"]
  }
});
