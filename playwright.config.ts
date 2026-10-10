import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    env: { EXAMWEB_DISABLE_PSI: "1" },
  },
});
