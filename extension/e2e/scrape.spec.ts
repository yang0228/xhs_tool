import { test, expect } from "@playwright/test";
import { getExtensionId, openSidePanel, navigateToTestPage } from "./helpers";

test.describe("Scrape Flow", () => {
  test("scrape extracts content from test page", async ({ context }) => {
    const testPage = await navigateToTestPage(context);
    await testPage.bringToFront();

    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=抓取当前页面内容").click();

    await expect(sidePanel.locator("text=Test Article Title")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("scrape button shows loading state", async ({ context }) => {
    const testPage = await navigateToTestPage(context);
    await testPage.bringToFront();

    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=抓取当前页面内容").click();
    await expect(sidePanel.locator("text=提取中...")).toBeVisible({ timeout: 3_000 });
  });
});
