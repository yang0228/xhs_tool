import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScraper } from "../../../src/sidepanel/hooks/useScraper";

vi.mock("../../../src/sidepanel/lib/scraper", () => ({
  scrapeCurrentPage: vi.fn(),
}));

import { scrapeCurrentPage } from "../../../src/sidepanel/lib/scraper";

const mockFn = scrapeCurrentPage as ReturnType<typeof vi.fn>;

const mockContent = {
  title: "T", content: "C", textContent: "TC", excerpts: [],
  url: "http://x.com", metadata: { siteName: "", publishedDate: "", author: "" },
};

describe("useScraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with loading=false, content=null, error=null", () => {
    const { result } = renderHook(() => useScraper());
    expect(result.current.loading).toBe(false);
    expect(result.current.content).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets content on success", async () => {
    mockFn.mockResolvedValue(mockContent);
    const { result } = renderHook(() => useScraper());

    await act(async () => {
      await result.current.scrape();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.content).toEqual(mockContent);
    expect(result.current.error).toBeNull();
  });

  it("sets error on scrape failure", async () => {
    mockFn.mockRejectedValue(new Error("Connection lost"));
    const { result } = renderHook(() => useScraper());

    await act(async () => {
      await result.current.scrape();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.content).toBeNull();
    expect(result.current.error).toBe("Connection lost");
  });

  it("returns null from scrape() on error", async () => {
    mockFn.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useScraper());

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.scrape();
    });

    expect(returnValue).toBeNull();
  });
});
