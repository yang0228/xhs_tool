/// <reference types="chrome" />

import { Readability } from "@mozilla/readability";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_PAGE") {
    try {
      const documentClone = document.cloneNode(true) as Document;
      // Short articles can lose Readability's scoring to a longer news feed.
      // Prefer a declared article body without changing the original page.
      const articleBody = document.querySelector(
        '.news-content-parsed, [itemprop="articleBody"]',
      );
      if (articleBody) {
        if (!articleBody.textContent?.trim()) {
          throw new Error("正文尚未加载，请等待文章加载完成后重试");
        }
        documentClone.body.replaceChildren(articleBody.cloneNode(true));
      }
      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (!article) {
        sendResponse({
          type: "SCRAPE_RESULT",
          payload: null,
          error: "Could not extract content from this page",
        });
        return;
      }

      // Extract blockquotes as excerpts
      const blockquotes = Array.from((articleBody ?? document).querySelectorAll("blockquote")).map(
        (el) => el.textContent?.trim() ?? ""
      ).filter(Boolean);

      const payload = {
        title: article.title || document.title,
        content: article.content || "",
        textContent: article.textContent || "",
        excerpts: blockquotes,
        url: window.location.href,
        metadata: {
          siteName: article.siteName ?? "",
          publishedDate: document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ?? "",
          author: article.byline ?? "",
        },
      };

      sendResponse({ type: "SCRAPE_RESULT", payload });
    } catch (error) {
      sendResponse({
        type: "SCRAPE_RESULT",
        payload: null,
        error: error instanceof Error ? error.message : "Unknown error scraping page",
      });
    }
  }

  return false;
});

console.log("XHS Tool content script loaded");
