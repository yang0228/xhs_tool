import { test, expect } from "@playwright/test";
import { getExtensionId, openSidePanel } from "./helpers";

test.describe("Drafts", () => {
  test("navigates to drafts page", async ({ context }) => {
    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=草稿").first().click();
    await expect(sidePanel.locator("text=我的草稿")).toBeVisible({ timeout: 5_000 });
  });

  test("drafts page renders without crash", async ({ context }) => {
    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=草稿").first().click();
    // Backend not running, so the page will either show loading or a fetch error.
    // Just verify the page didn't crash completely.
    await sidePanel.waitForTimeout(2000);
    await expect(sidePanel.locator("text=我的草稿")).toBeVisible();
  });
});
