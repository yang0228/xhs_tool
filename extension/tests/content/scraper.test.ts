import { beforeEach, describe, expect, it, vi } from "vitest";
import { chrome, resetChromeMocks } from "../mocks/chrome";

const headline = "研究机构预计示例公司第三季度利润增长";
const brief = "7月8日，资讯消息，研究机构发布了示例公司第三季度利润增长预测，原文没有披露测算口径。";

function newsFeed() {
  return `<div class="news-flow">${Array.from({ length: 25 }, (_, i) =>
    `<p>第${i}条其他新闻：行业动态、成交额与市场新闻，与当前文章无关。相关资讯继续更新，以下是新闻列表内容。</p>`,
  ).join("")}<blockquote>列表中的无关摘录</blockquote></div>`;
}

async function scrape() {
  await import("../../src/content/scraper");
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const respond = vi.fn();
  listener({ type: "SCRAPE_PAGE" }, {}, respond);
  return respond.mock.calls[0][0];
}

describe("content extraction", () => {
  beforeEach(() => {
    vi.resetModules();
    resetChromeMocks();
    document.head.innerHTML = `<title>${headline}</title><meta property="og:site_name" content="财经资讯">`;
    document.body.innerHTML = "";
  });

  it("keeps a short explicit article body instead of the longer news feed", async () => {
    document.body.innerHTML = `<h1>${headline}</h1><div class="news-content article-content"><div class="news-content-parsed"><p>${brief}</p></div></div><div>免责声明：内容仅供参考。</div>${newsFeed()}`;
    const before = document.body.innerHTML;
    const result = await scrape();
    expect(result.payload.title).toBe(headline);
    expect(result.payload.textContent.trim()).toBe(brief);
    expect(result.payload.content).not.toContain("新闻列表");
    expect(result.payload.excerpts).toEqual([]);
    expect(document.body.innerHTML).toBe(before);
  });

  it("preserves the complete structured article and scopes excerpts to it", async () => {
    const paragraphs = Array.from({ length: 80 }, (_, i) => `<p>正文第${i}段：这是文章的完整内容，应当保留段落中的实际信息，而不应截断成摘要。</p>`).join("");
    document.body.innerHTML = `<h1>${headline}</h1><div itemprop="articleBody">${paragraphs}<blockquote>正文中的引用</blockquote><p>正文最后一段。</p></div>${newsFeed()}`;
    const result = await scrape();
    expect(result.payload.textContent.length).toBeGreaterThan(3000);
    expect(result.payload.textContent).toContain("正文第79段");
    expect(result.payload.textContent).toContain("正文最后一段。");
    expect(result.payload.textContent).not.toContain("其他新闻");
    expect(result.payload.excerpts).toEqual(["正文中的引用"]);
  });

  it("asks for a retry when the declared article body has not loaded", async () => {
    document.body.innerHTML = `<h1>${headline}</h1><div class="news-content-parsed"></div>${newsFeed()}`;
    const result = await scrape();
    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/正文.*加载/);
  });

  it("retains Readability fallback for pages without an explicit article body", async () => {
    document.body.innerHTML = `<article><h1>${headline}</h1>${Array.from({ length: 20 }, () => `<p>${brief}</p>`).join("")}<p>通用文章结尾。</p></article>`;
    const result = await scrape();
    expect(result.payload.textContent).toContain("通用文章结尾。");
    expect(result.payload.title).toBe(headline);
  });
});
