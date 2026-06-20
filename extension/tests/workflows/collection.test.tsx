import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Scrape from "../../src/sidepanel/pages/Scrape";
import { decryptContent } from "../../src/sidepanel/lib/crypto";
import { resetChromeMocks } from "../mocks/chrome";
vi.mock("../../src/sidepanel/lib/scraper", () => ({
  scrapeCurrentPage: vi.fn(),
}));
import { scrapeCurrentPage } from "../../src/sidepanel/lib/scraper";
beforeEach(async () => {
  resetChromeMocks();
  await chrome.storage.local.set({
    settings: { backendUrl: "http://localhost:8000/api", apiKey: "test" },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("saves complete collected text beyond 2000 characters", async () => {
  const text = "内容".repeat(1600) + "文章末尾";
  vi.mocked(scrapeCurrentPage).mockResolvedValue({
    title: "长文章",
    textContent: text,
    url: "https://example.com/article",
    content: "",
    excerpts: [],
    metadata: {},
  });
  let saved: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      saved = JSON.parse(String(init.body));
      return Response.json({ ...saved, id: "material-1" });
    }),
  );
  render(
    <MemoryRouter>
      <Scrape />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "抓取当前页面内容" }));
  await screen.findByDisplayValue("长文章");
  fireEvent.click(screen.getByRole("button", { name: "保存素材" }));
  await waitFor(() => expect(saved?.encrypted_content).toBeTruthy());
  const plain = await decryptContent({
    ciphertext: saved.encrypted_content,
    iv: saved.encryption_iv,
    salt: saved.encryption_salt,
  });
  expect(plain).toContain(text);
  expect(saved.word_count).toBeGreaterThan(3000);
});
