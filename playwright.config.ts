import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    env: { AGENTDECK_DATA_PATH: ".agentdeck/e2e-data.json" },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
});
