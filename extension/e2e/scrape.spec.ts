import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel, navigateToTestPage } from "./helpers";
test("collects a real page with content script and carries complete material into writing", async ({
  context,
}) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  const article = await navigateToTestPage(context);
  await article.bringToFront();
  await page
    .getByRole("button", { name: "抓取当前页面内容" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByLabel("素材标题")).toHaveValue("周末散步的灵感");
  await expect(page.getByLabel("素材正文")).toHaveValue(/文章结尾/);
  await page.bringToFront();
  await page.getByLabel("标签", { exact: true }).fill("生活,灵感");
  await page.getByRole("button", { name: "保存素材", exact: true }).click();
  await page.getByRole("link", { name: "前往素材库" }).click();
  await expect(page.getByText("周末散步的灵感", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "带入创作" }).click();
  expect(await page.getByLabel("正文", { exact: true }).inputValue()).toContain(
    "文章结尾",
  );
});
