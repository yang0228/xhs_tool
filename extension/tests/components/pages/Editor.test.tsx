import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Editor from "../../../src/sidepanel/pages/Editor";

vi.mock("../../../src/sidepanel/lib/api", () => ({ apiPost: vi.fn(), apiPostStream: vi.fn() }));
vi.mock("../../../src/sidepanel/lib/crypto", () => ({ encryptContent: vi.fn(), hashContent: vi.fn() }));
const ms = { addToast: vi.fn() };
vi.mock("../../../src/sidepanel/stores/appStore", () => ({
  useAppStore: (sel: (s: typeof ms) => unknown) => sel(ms),
}));

function renderEditor(id = "new") {
  return render(
    <MemoryRouter initialEntries={[`/drafts/${id}`]}>
      <Routes><Route path="/drafts/:id" element={<Editor />} /></Routes>
    </MemoryRouter>,
  );
}

describe("Editor Page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders new draft title", () => {
    renderEditor();
    expect(screen.getByText("新建草稿")).toBeInTheDocument();
  });

  it("renders title and content inputs", () => {
    renderEditor();
    expect(screen.getByPlaceholderText("输入标题（最多20字）")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("开始写作... 或使用 AI 工具生成内容")).toBeInTheDocument();
  });

  it("renders AI buttons", () => {
    renderEditor();
    expect(screen.getByText("AI 生成标题")).toBeInTheDocument();
    expect(screen.getByText("AI 改写")).toBeInTheDocument();
    expect(screen.getByText("AI 润色")).toBeInTheDocument();
  });

  it("renders save and publish buttons", () => {
    renderEditor();
    expect(screen.getByText("保存草稿")).toBeInTheDocument();
    expect(screen.getByText("发布")).toBeInTheDocument();
  });

  it("shows character counter", () => {
    renderEditor();
    expect(screen.getByText("0 / 1000")).toBeInTheDocument();
  });
});
