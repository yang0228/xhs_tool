import { describe, it, expect, beforeEach } from "vitest";
import { scrapeCurrentPage } from "../../../src/sidepanel/lib/scraper";
import { chrome, resetChromeMocks } from "../../mocks/chrome";

const mockPayload = {
  title: "Test Page",
  content: "<p>Content</p>",
  textContent: "Content text",
  excerpts: ["Quote one"],
  url: "https://example.com",
  metadata: {
    siteName: "Example Site",
    publishedDate: "2024-01-01",
    author: "Test Author",
  },
};

describe("scrapeCurrentPage", () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  it("sends SCRAPE_PAGE message and returns payload", async () => {
    chrome.tabs.query.mockImplementation(
      (_qi: unknown, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        const tabs = [{ id: 99, url: "https://example.com" } as chrome.tabs.Tab];
        if (callback) { callback(tabs); return; }
        return Promise.resolve(tabs);
      },
    );

    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, callback?: (r: unknown) => void) => {
        const resp = { type: "SCRAPE_RESULT", payload: mockPayload };
        callback?.(resp);
        return Promise.resolve(resp);
      },
    );

    const result = await scrapeCurrentPage();
    expect(result).toEqual(mockPayload);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(99, { type: "SCRAPE_PAGE" });
  });

  it("throws when response has no payload", async () => {
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, callback?: (r: unknown) => void) => {
        const resp = { type: "SCRAPE_RESULT", payload: null, error: "Extraction failed" };
        callback?.(resp);
        return Promise.resolve(resp);
      },
    );

    await expect(scrapeCurrentPage()).rejects.toThrow("Extraction failed");
  });

  it("throws when no active tab", async () => {
    chrome.tabs.query.mockImplementation(
      (_qi: unknown, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        if (callback) { callback([]); return; }
        return Promise.resolve([]);
      },
    );

    await expect(scrapeCurrentPage()).rejects.toThrow("No active tab");
  });

  it("retries with script injection on connection error", async () => {
    let callCount = 0;
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, callback?: (r: unknown) => void) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Could not establish connection. Receiving end does not exist."));
        }
        const resp = { type: "SCRAPE_RESULT", payload: mockPayload };
        callback?.(resp);
        return Promise.resolve(resp);
      },
    );

    const result = await scrapeCurrentPage();
    expect(result).toEqual(mockPayload);
    expect(callCount).toBe(2);
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["assets/scraper.ts-test.js"],
    });
  });

  it("re-throws non-connection errors without retry", async () => {
    chrome.tabs.sendMessage.mockImplementation(() => {
      return Promise.reject(new Error("Some other error"));
    });

    await expect(scrapeCurrentPage()).rejects.toThrow("Some other error");
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});
