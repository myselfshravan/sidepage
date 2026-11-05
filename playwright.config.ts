import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same env files as the app, so the e2e author matches AUTHOR_EMAIL.
loadEnvConfig(process.cwd());

// End-to-end tests run against a production build (`pnpm build && pnpm start`)
// talking to the Firebase emulators. CI starts both; locally:
//   pnpm emulators   &   pnpm build && pnpm test:e2e
// A dedicated port, so nothing else on :3000 is mistaken for the app.
const PORT = Number(process.env.E2E_PORT ?? 3217);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /reader\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    // Every test signs in from the same IP.
    env: { SESSION_RATE_LIMIT_PER_MIN: "1000" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
