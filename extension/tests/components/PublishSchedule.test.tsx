import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PublishSchedule from "../../src/sidepanel/components/PublishSchedule";
import { encodeDraft } from "../../src/sidepanel/lib/drafts";
import type { Draft } from "../../src/shared/types";
import { resetChromeMocks } from "../mocks/chrome";

beforeEach(() => resetChromeMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function legacyDraft() {
  const encrypted = await encodeDraft({ title: "旧版草稿", content: "保留原始正文", image_ids: [] });
  return {
    encrypted,
    record: {
      ...encrypted,
      id: "legacy",
      version: 1,
      status: "draft",
      encryption_version: 1,
      content_iv: null,
    } as Draft,
  };
}

it("keeps readable drafts available when a legacy body IV is missing and retries after recovery", async () => {
  const { encrypted, record: legacy } = await legacyDraft();
  const readable = {
    ...(await encodeDraft({ title: "正常草稿", content: "可以正常排期", image_ids: [] })),
    id: "readable",
    version: 1,
    status: "draft",
  } as Draft;
  const original = JSON.stringify(legacy);
  let records = [legacy, readable];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: records, total: records.length, page: 1 })));
  render(<MemoryRouter><PublishSchedule /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "正常草稿" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "需要恢复的草稿" })).toBeInTheDocument();
  expect(screen.getAllByLabelText("调整计划日期")).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: "准备发布 →" })).toHaveLength(1);
  expect(screen.queryByText("本周暂无待发布内容，可先创建选题。")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  records = [{ ...legacy, content_iv: encrypted.content_iv, encryption_version: 2 }, readable];
  fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
  expect(await screen.findByRole("heading", { name: "旧版草稿" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "需要恢复的草稿" })).not.toBeInTheDocument();
  expect(screen.getAllByLabelText("调整计划日期")).toHaveLength(2);
  expect(JSON.stringify(legacy)).toBe(original);
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});

it("shows retained unreadable records instead of incorrectly claiming the week is empty", async () => {
  const { record } = await legacyDraft();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [record], total: 1, page: 1 })));
  render(<MemoryRouter><PublishSchedule /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "需要恢复的草稿" })).toBeInTheDocument();
  expect(screen.getByText(/旧版草稿缺少正文解密参数/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "前往设置恢复备份" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByLabelText("调整计划日期")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "准备发布 →" })).not.toBeInTheDocument();
  expect(screen.queryByText("本周暂无待发布内容，可先创建选题。")).not.toBeInTheDocument();
});

it("does not show an empty-week message when loading the schedule fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "排期读取暂时失败" }, { status: 503 })));
  render(<MemoryRouter><PublishSchedule /></MemoryRouter>);

  expect(await screen.findByRole("alert")).toHaveTextContent("排期读取暂时失败");
  await waitFor(() => expect(screen.queryByText("正在读取排期…")).not.toBeInTheDocument());
  expect(screen.queryByText("本周暂无待发布内容，可先创建选题。")).not.toBeInTheDocument();
});
