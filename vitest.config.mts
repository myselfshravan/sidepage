import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside the React server bundle; tests run plain Node.
  "server-only": fileURLToPath(new URL("./tests/support/empty-module.ts", import.meta.url)),
};

// Three suites. `unit` runs anywhere; `integration` and `rules` need the Firebase
// emulators (run them through `pnpm test:emulated`). Workers are capped so a run
// can't take over the machine.
export default defineConfig({
  resolve: { alias },
  test: {
    pool: "forks",
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/domain/**/*.test.ts", "tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/support/emulator-env.ts"],
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "rules",
          environment: "node",
          include: ["tests/rules/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
