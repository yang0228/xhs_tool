import { vi } from "vitest";

const storage = new Map<string, Record<string, unknown>>();

const listeners: Array<(message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined> = [];

export function fireOnMessage(message: unknown, sender?: unknown): unknown[] {
  const results: unknown[] = [];
  for (const listener of listeners) {
    const keepOpen = listener(
      message,
      sender ?? {},
      (response: unknown) => {
        results.push(response);
      },
    );
    if (!keepOpen) break;
  }
  return results;
}

export const chrome = {
  storage: {
    local: {
      get: vi.fn(
        (
          keys: string | string[] | null,
          callback?: (result: Record<string, unknown>) => void,
        ): Promise<Record<string, unknown>> | void => {
          const result: Record<string, unknown> = {};
          if (keys === null || keys === undefined) {
            storage.forEach((v, k) => {
              result[k] = v;
            });
          } else if (typeof keys === "string") {
            if (storage.has(keys)) result[keys] = storage.get(keys);
          } else if (Array.isArray(keys)) {
            for (const key of keys) {
              if (storage.has(key)) result[key] = storage.get(key);
            }
          }
          if (callback) {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        },
      ),
      set: vi.fn(
        (
          items: Record<string, unknown>,
          callback?: () => void,
        ): Promise<void> | void => {
          for (const [key, value] of Object.entries(items)) {
            storage.set(key, value as Record<string, unknown>);
          }
          if (callback) {
            callback();
            return;
          }
          return Promise.resolve();
        },
      ),
    },
  },

  tabs: {
    query: vi.fn(
      (
        _queryInfo: unknown,
        callback?: (tabs: chrome.tabs.Tab[]) => void,
      ): Promise<chrome.tabs.Tab[]> | void => {
        const result = [{ id: 1, url: "https://example.com" } as chrome.tabs.Tab];
        if (callback) {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      },
    ),
    sendMessage: vi.fn(
      (
        _tabId: number,
        message: unknown,
        callback?: (response: unknown) => void,
      ) => {
        const results = fireOnMessage(message, { tab: { id: _tabId } });
        const response = results.length > 0 ? results[0] : undefined;
        callback?.(response);
        return Promise.resolve(response);
      },
    ),
  },

  runtime: {
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      name: "XHS Tool",
      version: "0.1.0",
      content_scripts: [
        {
          js: ["assets/scraper.ts-test.js"],
          matches: ["<all_urls>"],
          run_at: "document_idle",
        },
      ],
    })),

    sendMessage: vi.fn(
      (
        message: unknown,
        callback?: (response: unknown) => void,
      ) => {
        const results = fireOnMessage(message);
        const response = results.length > 0 ? results[0] : undefined;
        callback?.(response);
        return Promise.resolve(response);
      },
    ),

    onMessage: {
      addListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: unknown,
            sendResponse: (r: unknown) => void,
          ) => boolean | undefined,
        ) => {
          listeners.push(listener);
        },
      ),
      removeListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: unknown,
            sendResponse: (r: unknown) => void,
          ) => boolean | undefined,
        ) => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
        },
      ),
    },

    lastError: undefined as { message: string } | undefined,
    id: "test-extension-id",
  },

  scripting: {
    executeScript: vi.fn(() => Promise.resolve()),
  },

  sidePanel: {
    setPanelBehavior: vi.fn(() => Promise.resolve()),
  },

  cookies: {
    getAll: vi.fn(
      (
        _details: { domain?: string },
        callback: (cookies: Array<{ name: string; value: string }>) => void,
      ) => {
        callback([{ name: "test_cookie", value: "test_value" }]);
      },
    ),
  },
};

export function resetChromeMocks() {
  storage.clear();
  listeners.length = 0;
  vi.resetAllMocks();
}
