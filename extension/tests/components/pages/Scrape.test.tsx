import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Scrape from "../../../src/sidepanel/pages/Scrape";

vi.mock("../../../src/sidepanel/lib/scraper", () => ({
  scrapeCurrentPage: vi.fn(),
}));
vi.mock("../../../src/sidepanel/lib/api", () => ({ apiPost: vi.fn() }));
vi.mock("../../../src/sidepanel/lib/crypto", () => ({
  encryptContent: vi.fn(),
  hashContent: vi.fn(),
}));
const ms = { addToast: vi.fn() };
vi.mock("../../../src/sidepanel/stores/appStore", () => ({
  useAppStore: (sel: (s: typeof ms) => unknown) => sel(ms),
}));

import { scrapeCurrentPage } from "../../../src/sidepanel/lib/scraper";
const mockScrape = scrapeCurrentPage as ReturnType<typeof vi.fn>;

describe("Scrape Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and scrape button", () => {
    render(
      <MemoryRouter>
        <Scrape />
      </MemoryRouter>,
    );
    expect(screen.getByText("发现值得记录的灵感")).toBeInTheDocument();
    expect(screen.getByText("抓取当前页面内容")).toBeInTheDocument();
  });

  it("shows loading state on click", async () => {
    mockScrape.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <Scrape />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByText("抓取当前页面内容"));
    expect(screen.getByText("提取中...")).toBeInTheDocument();
  });

  it("shows error on scrape failure", async () => {
    mockScrape.mockRejectedValue(new Error("Connection lost"));
    render(
      <MemoryRouter>
        <Scrape />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByText("抓取当前页面内容"));
    expect(await screen.findByText("Connection lost")).toBeInTheDocument();
  });

  it("renders content after successful scrape", async () => {
    mockScrape.mockResolvedValue({
      title: "Scraped Title",
      textContent: "Body text",
      url: "https://x.com",
    });
    render(
      <MemoryRouter>
        <Scrape />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByText("抓取当前页面内容"));
    expect(
      await screen.findByDisplayValue("Scraped Title"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 摘要")).toBeInTheDocument();
    expect(screen.getByText("保存素材")).toBeInTheDocument();
  });
});
