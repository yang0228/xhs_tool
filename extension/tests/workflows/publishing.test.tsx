import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Publish from "../../src/sidepanel/pages/Publish";
import { encryptContent } from "../../src/sidepanel/lib/crypto";
import { resetChromeMocks } from "../mocks/chrome";
let saved: any[];
beforeEach(async () => {
  resetChromeMocks();
  saved = [];
  await chrome.storage.local.set({
    settings: { backendUrl: "http://localhost:8000/api", apiKey: "owner" },
  });
  const t = await encryptContent("我的笔记");
  const c = await encryptContent("完整正文");
  const draft = {
    id: "draft-1",
    encrypted_title: t.ciphertext,
    encrypted_content: c.ciphertext,
    encryption_iv: t.iv,
    encryption_salt: t.salt,
    content_iv: c.iv,
    encryption_version: 2,
    image_ids: [],
    version: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      if (path === "/api/drafts/draft-1") return Response.json(draft);
      if (path === "/api/drafts")
        return Response.json({ items: [draft], total: 1, page: 1 });
      if (path === "/api/publish/records") {
        saved.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "post-1", ...saved[0] });
      }
      if (path === "/api/publish/posts")
        return Response.json({
          items: saved.map((p, i) => ({
            ...p,
            id: "post-" + (i + 1),
            published_at: new Date().toISOString(),
          })),
          total: saved.length,
          page: 1,
        });
      if (path === "/api/analytics/posts") return Response.json({ posts: [] });
      return Response.json({ detail: "missing" }, { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("previews a saved draft and records an actual publication URL", async () => {
  render(
    <MemoryRouter initialEntries={["/publish?draft=draft-1"]}>
      <Publish />
    </MemoryRouter>,
  );
  await screen.findByText("完整正文");
  fireEvent.change(screen.getByLabelText("已发布链接"), {
    target: { value: "https://www.xiaohongshu.com/explore/example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "记录发布" }));
  await waitFor(() =>
    expect(saved).toEqual([
      {
        draft_id: "draft-1",
        xhs_post_url: "https://www.xiaohongshu.com/explore/example",
      },
    ]),
  );
  await screen.findByRole("link", { name: "查看笔记 ↗" });
});
it("does not record an unrelated URL", async () => {
  render(
    <MemoryRouter initialEntries={["/publish?draft=draft-1"]}>
      <Publish />
    </MemoryRouter>,
  );
  await screen.findByText("完整正文");
  fireEvent.change(screen.getByLabelText("已发布链接"), {
    target: { value: "https://example.com/fake" },
  });
  fireEvent.click(screen.getByRole("button", { name: "记录发布" }));
  await screen.findByRole("alert");
  expect(saved).toHaveLength(0);
});
