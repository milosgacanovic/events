import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  use: {
    headless: true,
    baseURL: "http://localhost:13000",
  },
  timeout: 30000,
});
