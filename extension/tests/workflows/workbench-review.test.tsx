import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Materials from "../../src/sidepanel/pages/Materials";
import PublishSchedule from "../../src/sidepanel/components/PublishSchedule";
import GroundedWriter from "../../src/sidepanel/components/GroundedWriter";
import ContentReview from "../../src/sidepanel/components/ContentReview";
import PublicationSnapshot from "../../src/sidepanel/components/PublicationSnapshot";
import CardStudio from "../../src/sidepanel/components/CardStudio";
import { useDraftEditor } from "../../src/sidepanel/hooks/useDraftEditor";
import {
  encodeDraft,
  recoveryScope,
  type DraftDocument,
} from "../../src/sidepanel/lib/drafts";
import { encryptContent } from "../../src/sidepanel/lib/crypto";
import { emptyContext } from "../../src/sidepanel/lib/creator";
import { encodePublicationSnapshot } from "../../src/sidepanel/lib/publication";
import * as cards from "../../src/sidepanel/lib/cards";
import type { PublishedPost } from "../../src/shared/types";
import { resetChromeMocks } from "../mocks/chrome";

const ownerA = { backendUrl: "https://a.test/api", apiKey: "owner-a" };
const ownerB = { backendUrl: "https://b.test/api", apiKey: "owner-b" };
const documentA: DraftDocument = {
  title: "A 私人选题",
  content: "A 私人正文",
  image_ids: [],
};
beforeEach(async () => {
  resetChromeMocks();
  await chrome.storage.local.set({ settings: ownerA });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function SeedTarget() {
  const { state } = useLocation();
  const editor = useDraftEditor("new", state?.seed, state?.seedScope);
  return (
    <div>
      {editor.error ? <p role="alert">{editor.error}</p> : editor.doc.title}
    </div>
  );
}

it("clears selected plaintext before rebinding a refreshed material list to another account", async () => {
  const enc = await encryptContent(
    JSON.stringify({ format: 2, title: "A 素材", content: "A 私人正文" }),
  );
  const record = {
    id: "material-a",
    encrypted_content: enc.ciphertext,
    encryption_iv: enc.iv,
    encryption_salt: enc.salt,
    tags: [],
    created_at: new Date().toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      Response.json({
        items: input.startsWith(ownerA.backendUrl) ? [record] : [],
        total: input.startsWith(ownerA.backendUrl) ? 1 : 0,
        page: 1,
      }),
    ),
  );
  render(
    <MemoryRouter>
      <Materials />
    </MemoryRouter>,
  );
  await screen.findByText("A 素材", { exact: true });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "带入创作" })).toBeInTheDocument();
  await chrome.storage.local.set({ settings: ownerB });
  fireEvent.change(screen.getByRole("textbox", { name: "搜索素材" }), {
    target: { value: "私人" },
  });
  await screen.findByText("没有匹配的素材");
  expect(
    screen.queryByRole("button", { name: "带入创作" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "AI 生成提纲" }),
  ).not.toBeInTheDocument();
  expect(
    vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
  ).toBe(false);
});

it("rejects a carry-forward seed whose source scope differs from the destination editor", async () => {
  const seedScope = await recoveryScope(ownerA);
  await chrome.storage.local.set({ settings: ownerB });
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/drafts/new", state: { seed: documentA, seedScope } },
      ]}
    >
      <SeedTarget />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("切换");
  expect(screen.queryByText(documentA.title)).not.toBeInTheDocument();
  expect(await chrome.storage.local.get(null)).not.toHaveProperty(
    "draft_recovery",
  );
});

it("retains the review result scope when turning a suggestion into a new topic", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      Response.json(
        input.includes("/insights")
          ? { groups: [] }
          : {
              observations: [],
              ideas: [
                {
                  title: documentA.title,
                  reason: documentA.content,
                  post_ids: ["post-a"],
                },
              ],
              limitations: [],
            },
      ),
    ),
  );
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ContentReview onImported={() => {}} />} />
        <Route path="/drafts/new" element={<SeedTarget />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "生成复盘建议" }));
  await screen.findByText(documentA.title);
  await chrome.storage.local.set({ settings: ownerB });
  fireEvent.click(screen.getByRole("link", { name: "转为新选题" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("切换");
  expect(screen.queryByText(documentA.title)).not.toBeInTheDocument();
});

it("does not reschedule an old account document on a cloned backend with the same ID and version", async () => {
  const record = {
    ...(await encodeDraft(documentA)),
    id: "shared-id",
    version: 1,
    status: "idea",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) =>
      Response.json(
        init?.method === "PUT"
          ? record
          : { items: [record], total: 1, page: 1 },
      ),
    ),
  );
  render(
    <MemoryRouter>
      <PublishSchedule />
    </MemoryRouter>,
  );
  await screen.findByText(documentA.title);
  await chrome.storage.local.set({ settings: ownerB });
  fireEvent.change(screen.getByLabelText("调整计划日期"), {
    target: { value: "2026-10-20" },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("切换");
  expect(
    vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT"),
  ).toBe(false);
});

it.each(["未完成的正文 [1]", "未校验的编号 [999]"])(
  "keeps truncated grounded output visible but not applicable: %s",
  async (partial) => {
    const source = {
      id: "chunk-a",
      material_id: "material-a",
      title: "来源",
      content: "依据",
      content_hash: "hash",
    };
    const onApply = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.endsWith("/rag/retrieve")
          ? Response.json({ sources: [source] })
          : new Response(`data: ${JSON.stringify({ chunk: partial })}\n\n`, {
              headers: { "Content-Type": "text/event-stream" },
            }),
      ),
    );
    render(
      <GroundedWriter doc={documentA} identity={ownerA} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "生成带引用正文" }));
    await screen.findByText(partial);
    expect(await screen.findByRole("alert")).toHaveTextContent("中断");
    expect(
      screen.getByRole("button", { name: "采用带引用建议" }),
    ).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "shows and downloads ordered original images from a deleted draft snapshot (cards=%s)",
  async (withCards) => {
    const doc = {
      ...documentA,
      image_ids: ["old-1", "old-2"],
      ...(withCards
        ? {
            context: {
              ...emptyContext(),
              cards: {
                template: "checklist" as const,
                palette: "rose" as const,
                source_signature: "hash",
                pages: [{ title: "封面", body: "", image_id: "old-1" }],
              },
            },
          }
        : {}),
    };
    const post = {
      id: "post-a",
      draft_id: null,
      snapshot: await encodePublicationSnapshot(doc, 3),
      draft_version: 3,
      image_ids: ["restored-1", "restored-2"],
    } as PublishedPost;
    const downloaded: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.startsWith(ownerA.backendUrl))
          return Response.json({
            download_url: "https://images.test/" + input.split("/").at(-2),
          });
        downloaded.push(input);
        return new Response("original", {
          headers: { "Content-Type": "image/jpeg" },
        });
      }),
    );
    let serial = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => "blob:original-" + ++serial,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<PublicationSnapshot post={post} identity={ownerA} />);
    fireEvent.click(screen.getByRole("button", { name: "查看发布快照" }));
    await screen.findByText(documentA.content);
    fireEvent.click(screen.getByRole("button", { name: "查看发布原图" }));
    await screen.findByRole("img", { name: "发布原图 2" });
    expect(
      screen.getAllByRole("img").map((img) => img.getAttribute("alt")),
    ).toEqual(["发布原图 1", "发布原图 2"]);
    expect(downloaded).toEqual([
      "https://images.test/restored-1",
      "https://images.test/restored-2",
    ]);
    expect(screen.getByRole("link", { name: "下载原图 1" })).toHaveAttribute(
      "download",
      "original-01.jpg",
    );
    expect(screen.getByRole("link", { name: "下载原图 2" })).toHaveAttribute(
      "href",
      "blob:original-2",
    );
  },
);

it("refuses historical image requests after switching account", async () => {
  const post = {
    id: "post-a",
    snapshot: await encodePublicationSnapshot(
      { ...documentA, image_ids: ["image-a"] },
      1,
    ),
    image_ids: ["image-a"],
  } as PublishedPost;
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(<PublicationSnapshot post={post} identity={ownerA} />);
  fireEvent.click(screen.getByRole("button", { name: "查看发布快照" }));
  await screen.findByText(documentA.content);
  await chrome.storage.local.set({ settings: ownerB });
  fireEvent.click(screen.getByRole("button", { name: "查看发布原图" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("切换");
  expect(request).not.toHaveBeenCalled();
});

it("does not split a 100-page design into an unsaveable draft", async () => {
  const onChange = vi.fn();
  render(
    <CardStudio
      title="标题"
      content="正文"
      imageIds={[]}
      value={{
        template: "checklist",
        palette: "rose",
        source_signature: "hash",
        pages: Array.from({ length: 100 }, () => ({
          title: "页",
          body: "两段文字",
        })),
      }}
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "拆分第 1 页" })).toBeDisabled();
  expect(screen.getByText(/最多 100 页/)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("rejects generated cards above 100 pages without truncating the document", () => {
  expect(() =>
    cards.paginateCards("标题", Array(100).fill("正文").join("\f"), () => 10),
  ).toThrow(/100 页/);
});
