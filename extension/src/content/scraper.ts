/// <reference types="chrome" />

import { Readability } from "@mozilla/readability";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_PAGE") {
    try {
      const documentClone = document.cloneNode(true) as Document;
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
      const blockquotes = Array.from(document.querySelectorAll("blockquote")).map(
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
