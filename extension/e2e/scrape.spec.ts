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

test("collects only a short news article after a longer news feed loads", async ({ context }) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  const title = "研究机构发布示例公司利润预测";
  const body = "资讯消息，研究机构预计示例公司第三季度利润增长，原文没有披露测算口径。";
  await context.route("http://xhs-fixture.test/short-news", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<html><head><title>${title}</title></head><body><h1>${title}</h1><div class="news-content article-content"><div class="news-content-parsed"><p>${body}</p></div></div><p>免责声明：内容仅供参考。</p><script>const feed=document.createElement('div');feed.className='news-flow';feed.innerHTML=${JSON.stringify(Array.from({ length: 30 }, () => "<p>这是一条无关新闻列表内容，覆盖市场信息、行业动态和其他新闻，不是当前文章正文。</p>").join(""))};document.body.append(feed);</script></body></html>`,
  }));
  const article = await context.newPage();
  await article.goto("http://xhs-fixture.test/short-news");
  await expect(article.locator(".news-flow p")).toHaveCount(30);
  await article.bringToFront();
  await page.getByRole("button", { name: "抓取当前页面内容" }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByLabel("素材标题")).toHaveValue(title);
  await expect(page.getByLabel("素材正文")).toHaveValue(body);
  await page.bringToFront();
  await page.getByRole("button", { name: "保存素材", exact: true }).click();
  await page.getByRole("link", { name: "前往素材库" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "带入创作" }).click();
  const content = await page.getByLabel("正文", { exact: true }).inputValue();
  expect(content).toContain(body);
  expect(content).not.toContain("新闻列表");
  expect(content).not.toContain("免责声明");
});
