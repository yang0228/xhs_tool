import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Editor from "../../src/sidepanel/pages/Editor";
import { decryptContent, encryptContent } from "../../src/sidepanel/lib/crypto";
import { resetChromeMocks } from "../mocks/chrome";

let records: Record<string, any>;
beforeEach(async () => {
  resetChromeMocks();
  records = {};
  await chrome.storage.local.set({
    settings: {
      backendUrl: "http://localhost:8000/api",
      apiKey: "test-owner",
      aiModel: "deepseek-chat",
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path === "/api/ai/polish")
        return Response.json({ polished: "经过润色的新正文" });
      if (path === "/api/images")
        return Response.json({ items: [], total: 0, page: 1 });
      if (path === "/api/drafts" && init?.method === "POST") {
        const id = body.client_id || crypto.randomUUID();
        records[id] ||= { ...body, id, version: 1, status: "draft" };
        return Response.json(records[id]);
      }
      const id = path.split("/").pop()!;
      if (init?.method === "PUT") {
        if (body.expected_version !== records[id]?.version)
          return Response.json({ detail: "版本冲突" }, { status: 409 });
        records[id] = {
          ...records[id],
          ...body,
          version: records[id].version + 1,
        };
      }
      return records[id]
        ? Response.json(records[id])
        : Response.json({ detail: "Not found" }, { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(id = "new") {
  return render(
    <MemoryRouter initialEntries={["/drafts/" + id]}>
      <Routes>
        <Route path="/drafts/:id" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function seed() {
  const title = await encryptContent("原始标题");
  const content = await encryptContent("原始正文");
  const id = crypto.randomUUID();
  records[id] = {
    id,
    encrypted_title: title.ciphertext,
    encrypted_content: content.ciphertext,
    encryption_iv: title.iv,
    encryption_salt: title.salt,
    content_iv: content.iv,
    encryption_version: 2,
    image_ids: [],
    version: 1,
    status: "draft",
  };
  return id;
}
describe("draft editing workflow", () => {
  it("loads existing text, saves an update and reopens the same draft", async () => {
    const id = await seed();
    const view = mount(id);
    await screen.findByDisplayValue("原始正文");
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "更新后的正文" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(records[id].version).toBe(2));
    expect(Object.keys(records)).toHaveLength(1);
    view.unmount();
    mount(id);
    await screen.findByDisplayValue("更新后的正文");
    expect(
      await decryptContent({
        ciphertext: records[id].encrypted_content,
        iv: records[id].content_iv,
        salt: records[id].encryption_salt,
      }),
    ).toBe("更新后的正文");
  });
  it("keeps AI suggestions separate until explicitly applied and supports undo", async () => {
    const id = await seed();
    mount(id);
    await screen.findByDisplayValue("原始正文");
    fireEvent.click(screen.getByRole("button", { name: "AI 润色" }));
    await screen.findByText("经过润色的新正文");
    expect(screen.getByLabelText("正文")).toHaveValue("原始正文");
    fireEvent.click(screen.getByRole("button", { name: "采用建议" }));
    expect(screen.getByLabelText("正文")).toHaveValue("经过润色的新正文");
    fireEvent.click(screen.getByRole("button", { name: "撤销 AI 修改" }));
    expect(screen.getByLabelText("正文")).toHaveValue("原始正文");
  });
  it("preserves local text when server version has advanced", async () => {
    const id = await seed();
    mount(id);
    await screen.findByDisplayValue("原始正文");
    records[id].version = 2;
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "我的未同步修改" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("版本冲突"),
    );
    expect(screen.getByLabelText("正文")).toHaveValue("我的未同步修改");
    expect(records[id].version).toBe(2);
  });
});
it("uses signed private image URLs in the editor picker", async () => {
  const id = await seed();
  const fallback = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/images")
      return Response.json({
        items: [
          {
            id: "image-1",
            r2_url: "https://private.r2.example/unsigned.png",
            original_filename: "配图.png",
          },
        ],
        total: 1,
        page: 1,
      });
    if (path === "/api/images/image-1/download-url")
      return Response.json({
        download_url: "https://private.r2.example/signed.png?signature=valid",
      });
    return fallback(input, init);
  });
  mount(id);
  await screen.findByDisplayValue("原始正文");
  fireEvent.click(screen.getByRole("button", { name: "选择配图" }));
  await waitFor(() =>
    expect(screen.getByRole("img", { name: "配图.png" })).toHaveAttribute(
      "src",
      "https://private.r2.example/signed.png?signature=valid",
    ),
  );
});
