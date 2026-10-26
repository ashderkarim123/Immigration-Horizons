import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./e2e/teardown.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // CI only: one retry, so an infrastructure blip does not block a release, while a test that needed it is
  // reported as FLAKY (never silently passed) and a genuine failure still fails the run. Locally a failure is a failure.
  retries: process.env.CI ? 1 : 0,
  // The "github" reporter turns each failure into a public annotation, so a failed CI run names the test and the
  // error without needing the downloadable report (which needs a GitHub login).
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
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
