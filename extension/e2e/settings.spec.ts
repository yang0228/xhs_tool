import { test, expect } from "@playwright/test";
import { getExtensionId, openSidePanel } from "./helpers";

test.describe("Settings", () => {
  test("navigates to settings page", async ({ context }) => {
    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=设置").first().click();
    await expect(sidePanel.locator("text=后端地址")).toBeVisible({ timeout: 5_000 });
    await expect(sidePanel.locator("text=API Key")).toBeVisible();
  });

  test("backend URL input is editable", async ({ context }) => {
    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=设置").first().click();
    const urlInput = sidePanel.locator('input[type="text"]').first();
    await urlInput.clear();
    await urlInput.fill("https://my-api.example.com");
    expect(await urlInput.inputValue()).toBe("https://my-api.example.com");
  });

  test("about section is visible", async ({ context }) => {
    const extId = await getExtensionId(context);
    const sidePanel = await openSidePanel(context, extId);

    await sidePanel.locator("text=设置").first().click();
    await expect(sidePanel.locator("text=0.1.0")).toBeVisible({ timeout: 5_000 });
  });
});
