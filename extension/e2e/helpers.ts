import type { BrowserContext, Page } from "@playwright/test";

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const page = await context.waitForEvent("page", {
    predicate: (p: Page) => p.url().startsWith("chrome-extension://"),
    timeout: 10_000,
  });
  await page.waitForLoadState("domcontentloaded");
  return new URL(page.url()).hostname;
}

export async function openSidePanel(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`;
  const page = await context.newPage();
  await page.goto(sidePanelUrl, { waitUntil: "domcontentloaded" });
  return page;
}

export async function navigateToTestPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Test Article</title></head>
    <body>
      <article>
        <h1>Test Article Title</h1>
        <p>This is the first paragraph of test content. It contains enough text to be meaningful.</p>
        <p>This is the second paragraph with more detailed information about the topic.</p>
        <blockquote>A notable quote from the article that stands out.</blockquote>
        <p>Final concluding paragraph with additional context.</p>
      </article>
    </body>
    </html>
  `);
  await page.waitForLoadState("domcontentloaded");
  return page;
}
