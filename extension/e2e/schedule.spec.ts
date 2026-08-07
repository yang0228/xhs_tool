import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel } from "./helpers";

test("a legacy draft with a missing body IV does not block readable schedules", async ({ context }) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  await page.getByRole("navigation").getByRole("link", { name: "创作", exact: true }).click();
  await page.getByRole("link", { name: "新建", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("正常排期草稿");
  await page.getByLabel("正文", { exact: true }).fill("这份正文应当仍可准备发布。");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^已保存$/ })).toBeVisible();

  const records = await page.evaluate(async () => {
    const response = await fetch("http://localhost:8000/api/drafts?limit=100", {
      headers: { Authorization: "Bearer test-key" },
    });
    if (!response.ok) throw new Error("Fixture draft read failed");
    return (await response.json()).items;
  });
  const readable = { ...records[0], status: "draft" };
  const legacy = { ...readable, id: "legacy", content_iv: null, encryption_version: 1 };
  await context.route("http://localhost:8000/api/drafts?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ items: [legacy, readable], total: 2, page: 1 }),
    }),
  );

  await page.getByRole("navigation").getByRole("link", { name: "发布", exact: true }).click();
  await page.getByRole("button", { name: "发布排期", exact: true }).click();
  await expect(page.getByRole("heading", { name: "正常排期草稿" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "需要恢复的草稿" })).toBeVisible();
  await expect(page.getByText(/旧版草稿缺少正文解密参数/)).toBeVisible();
  await expect(page.getByLabel("调整计划日期")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "准备发布 →" })).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("本周暂无待发布内容，可先创建选题。")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/xhs-tool-schedule-legacy.png", fullPage: true });
});
