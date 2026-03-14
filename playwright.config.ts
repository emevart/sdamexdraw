import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-1920",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "tablet",
      use: { ...devices["iPad Pro 11"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],
  // Dev server is started externally (Next.js on port 3000)
});
