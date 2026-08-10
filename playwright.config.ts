import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const e2eDataPath = join(mkdtempSync(join(tmpdir(), "agentdeck-e2e-data-")), "data.json");

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    env: { AGENTDECK_DATA_PATH: e2eDataPath, AGENTDECK_E2E_STUB: "1", AGENTDECK_E2E_ASYNC_INPUT: "1" },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
});
