import { describe, it, expect, beforeEach } from "vitest";
import { sendToActiveTab } from "../../../src/shared/messages";
import { chrome, resetChromeMocks } from "../../mocks/chrome";

describe("sendToActiveTab", () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  it("resolves with the response from the active tab", async () => {
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
        const resp = { type: "SCRAPE_RESULT", payload: { title: "Test" } };
        callback?.(resp);
        return Promise.resolve(resp);
      },
    );

    const result = await sendToActiveTab({ type: "SCRAPE_PAGE" });
    expect(result).toEqual({ type: "SCRAPE_RESULT", payload: { title: "Test" } });
  });

  it("rejects when no active tab", async () => {
    chrome.tabs.query.mockImplementation(
      (_qi: unknown, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        if (callback) { callback([]); return; }
        return Promise.resolve([]);
      },
    );

    await expect(sendToActiveTab({ type: "SCRAPE_PAGE" })).rejects.toThrow("No active tab");
  });

  it("rejects when chrome.runtime.lastError is set", async () => {
    // tabs.query returns a valid tab, but sendMessage triggers lastError
    chrome.tabs.query.mockImplementation(
      (_qi: unknown, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
        const tabs = [{ id: 1 } as chrome.tabs.Tab];
        if (callback) { callback(tabs); return; }
        return Promise.resolve(tabs);
      },
    );
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, callback?: (r: unknown) => void) => {
        chrome.runtime.lastError = { message: "Could not establish connection." };
        callback?.(undefined);
        return Promise.resolve(undefined);
      },
    );

    await expect(sendToActiveTab({ type: "SCRAPE_PAGE" })).rejects.toThrow("Could not establish connection");
  });
});
