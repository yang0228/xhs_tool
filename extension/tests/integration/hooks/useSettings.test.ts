import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings } from "../../../src/sidepanel/hooks/useSettings";
import { chrome, resetChromeMocks } from "../../mocks/chrome";

describe("useSettings", () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  it("starts with defaults, then loads from chrome.storage", () => {
    // chrome.storage.local.get mock calls callback synchronously,
    // so loaded will be true immediately after renderHook
    chrome.storage.local.set({
      settings: { backendUrl: "https://custom.api.com", apiKey: "key-123" },
    });
    const { result } = renderHook(() => useSettings());
    expect(result.current.loaded).toBe(true);
    expect(result.current.settings.backendUrl).toBe("https://custom.api.com");
    expect(result.current.settings.apiKey).toBe("key-123");
  });

  it("updateSettings merges partial and writes to storage", async () => {
    const { result } = renderHook(() => useSettings());
    await act(async () => {
      await result.current.updateSettings({ apiKey: "new-key" });
    });
    expect(result.current.settings.apiKey).toBe("new-key");
    expect(result.current.settings.backendUrl).toBe("http://localhost:8000/api");
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});
