import { test, expect } from "@playwright/test";
import { getExtensionId, openSidePanel } from "./helpers";

test.describe("Extension Smoke", () => {
  test("extension loads and service worker starts", async ({ context }) => {
    const extId = await getExtensionId(context);
    expect(extId).toBeTruthy();
    expect(extId.length).toBeGreaterThan(0);
  });

  test("side panel renders without JS errors", async ({ context }) => {
    const extId = await getExtensionId(context);
    const errors: string[] = [];

    const page = await openSidePanel(context, extId);
    page.on("pageerror", (err) => errors.push(err.message));

    await expect(page.locator("text=XHS Tool")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("navigation tabs are all present", async ({ context }) => {
    const extId = await getExtensionId(context);
    const page = await openSidePanel(context, extId);

    const tabs = ["抓取", "草稿", "素材", "图片", "发布", "数据", "设置"];
    for (const tab of tabs) {
      await expect(page.locator(`text=${tab}`).first()).toBeVisible();
    }
  });

  test("default route shows scrape button", async ({ context }) => {
    const extId = await getExtensionId(context);
    const page = await openSidePanel(context, extId);

    await expect(page.locator("text=抓取当前页面内容")).toBeVisible({ timeout: 5_000 });
  });
});
