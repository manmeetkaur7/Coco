import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../private-assets/test-results",
  reporter: "list",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3210",
    headless: true,
    // Use the installed Windows browser; no avatar service or browser download.
    channel: process.platform === "win32" ? "msedge" : undefined,
    trace: "off",
  },
  webServer: [
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3210",
      url: "http://127.0.0.1:3210",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8010",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
    {
      command: `${process.platform === "win32" ? "..\\backend\\.venv\\Scripts\\python.exe" : "../backend/.venv/bin/python"} -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8010`,
      url: "http://127.0.0.1:8010/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { CORS_ORIGINS: "http://127.0.0.1:3210" },
    },
  ],
});
