import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./e2e/teardown.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3180",
    browserName: "chromium",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    launchOptions: { channel: "chromium" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/server.cjs",
    url: "http://localhost:3180/__browser_fixture",
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
