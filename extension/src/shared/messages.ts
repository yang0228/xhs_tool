import type { ScrapedContent } from "./types";

// Message types for extension internal communication
export type ExtensionMessage =
  | { type: "SCRAPE_PAGE" }
  | { type: "SCRAPE_RESULT"; payload: ScrapedContent | null; error?: string }
  | { type: "HIGHLIGHT_MODE"; active: boolean }
  | { type: "ELEMENT_SELECTED"; payload: { text: string; html: string } }
  | { type: "GET_XHS_COOKIES" }
  | { type: "XHS_COOKIES_RESULT"; payload: string | null };

export type MessageResponse<T = void> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

export function sendToActiveTab<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        reject(new Error("No active tab"));
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    });
  });
}
