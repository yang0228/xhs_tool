import type { ScrapedContent } from "../../shared/types";

async function ensureContentScript(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const scripts = manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? [];
  if (scripts.length === 0) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Cannot access") || msg.includes("permission")) {
      throw new Error("无法访问该页面，请确认页面已完全加载且非 chrome:// 等受限页面");
    }
    throw e;
  }
}

export async function scrapeCurrentPage(): Promise<ScrapedContent> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PAGE" });
    if (!response?.payload) {
      throw new Error(response?.error || "Failed to extract content");
    }
    return response.payload;
  } catch (e) {
    // Content script may not be loaded (e.g. extension was just reloaded).
    // Inject it programmatically and retry.
    if (e instanceof Error && e.message.includes("Could not establish connection")) {
      await ensureContentScript(tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PAGE" });
      if (!response?.payload) {
        throw new Error(response?.error || "Failed to extract content");
      }
      return response.payload;
    }
    throw e;
  }
}
