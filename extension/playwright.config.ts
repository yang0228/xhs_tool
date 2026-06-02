import { defineConfig } from "@playwright/test";
import path from "node:path";

const EXTENSION_PATH = path.resolve(__dirname, "dist");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    headless: false,
    channel: "chromium",
    viewport: { width: 480, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        },
      },
    },
  ],
});
