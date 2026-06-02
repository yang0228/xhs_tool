import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Publish from "../../../src/sidepanel/pages/Publish";

vi.mock("../../../src/sidepanel/lib/api", () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("../../../src/sidepanel/lib/crypto", () => ({ encryptContent: vi.fn() }));
const ms = { addToast: vi.fn() };
vi.mock("../../../src/sidepanel/stores/appStore", () => ({
  useAppStore: (sel: (s: typeof ms) => unknown) => sel(ms),
}));

import { apiGet } from "../../../src/sidepanel/lib/api";
const mockGet = apiGet as ReturnType<typeof vi.fn>;

describe("Publish Page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders title", () => {
    mockGet.mockResolvedValue({ posts: [] });
    render(<Publish />);
    expect(screen.getByText("发布管理")).toBeInTheDocument();
  });

  it("renders capture cookies button", () => {
    mockGet.mockResolvedValue({ posts: [] });
    render(<Publish />);
    expect(screen.getByText("捕获 XHS 会话")).toBeInTheDocument();
    expect(screen.getByText("首次使用需要捕获小红书登录 Cookie")).toBeInTheDocument();
  });

  it("shows empty publish records", async () => {
    mockGet.mockResolvedValue({ posts: [] });
    render(<Publish />);
    expect(await screen.findByText("暂无发布记录")).toBeInTheDocument();
  });
});
