import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Images from "../../../src/sidepanel/pages/Images";

vi.mock("../../../src/sidepanel/lib/api", () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
const ms = { addToast: vi.fn() };
vi.mock("../../../src/sidepanel/stores/appStore", () => ({
  useAppStore: (sel: (s: typeof ms) => unknown) => sel(ms),
}));

import { apiGet } from "../../../src/sidepanel/lib/api";
const mockGet = apiGet as ReturnType<typeof vi.fn>;

describe("Images Page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders title", () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<Images />);
    expect(screen.getByText("图片库")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Images />);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("renders upload button", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<Images />);
    expect(await screen.findByText("+ 上传图片到 R2")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<Images />);
    expect(await screen.findByText("暂无图片")).toBeInTheDocument();
  });
});
