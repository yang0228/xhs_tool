import type { BrowserContext, Page } from "@playwright/test";
export async function getExtensionId(context: BrowserContext): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).hostname;
}
export async function openSidePanel(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      settings: {
        backendUrl: "http://localhost:8000/api",
        apiKey: "test-key",
        aiModel: "deepseek-chat",
      },
    });
  });
  return page;
}
export async function navigateToTestPage(
  context: BrowserContext,
): Promise<Page> {
  await context.route("http://xhs-fixture.test/article", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body:
        '<html><head><meta charset="UTF-8"><title>周末散步的灵感</title></head><body><article><h1>周末散步的灵感</h1>' +
        Array.from(
          { length: 30 },
          (_, i) =>
            `<p>第 ${i} 段：沿着河边散步，观察植物、建筑和日常生活的细节。记录真实体验，让分享保留自己的视角。这是一段用于验证长文采集的完整内容。</p>`,
        ).join("") +
        "<p>这里是文章结尾，必须完整保留。</p></article></body></html>",
    }),
  );
  const page = await context.newPage();
  await page.goto("http://xhs-fixture.test/article");
  return page;
}
