import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel } from "./helpers";
test("creates, reopens, edits, adopts AI and prepares a publication", async ({
  context,
}) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  await page.getByRole("link", { name: "创作", exact: true }).click();
  await page.getByRole("link", { name: "新建", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("周末的慢生活");
  await page
    .getByLabel("正文", { exact: true })
    .fill("把散步时看到的风景和想法记录下来。");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^已保存$/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "全部草稿" }).click();
  await page.getByRole("heading", { name: "周末的慢生活" }).click();
  await expect(page.getByLabel("正文", { exact: true })).toHaveValue(
    "把散步时看到的风景和想法记录下来。",
  );
  await page.getByRole("button", { name: "AI 润色" }).click();
  await expect(
    page.getByText("打磨后的文字，仍然保留真实体验。"),
  ).toBeVisible();
  await expect(page.getByLabel("正文", { exact: true })).toHaveValue(
    "把散步时看到的风景和想法记录下来。",
  );
  await page.getByRole("button", { name: "采用建议" }).click();
  await page.locator("main").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "/tmp/xhs-tool-editor.png", fullPage: true });
  await page.getByRole("button", { name: "准备发布 →" }).click();
  await expect(
    page.getByRole("link", { name: "打开小红书创作中心 ↗" }),
  ).toBeVisible();
  await page
    .getByLabel("已发布链接")
    .fill("https://www.xiaohongshu.com/explore/browser-test");
  await page.getByRole("button", { name: "记录发布", exact: true }).click();
  await expect(page.getByRole("link", { name: "查看笔记 ↗" })).toBeVisible();
  await page.screenshot({ path: "/tmp/xhs-tool-publish.png", fullPage: true });
  await page.getByRole("link", { name: "创作", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
});
