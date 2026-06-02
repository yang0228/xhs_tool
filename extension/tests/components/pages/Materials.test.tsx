import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Materials from "../../../src/sidepanel/pages/Materials";

vi.mock("../../../src/sidepanel/lib/api", () => ({ apiGet: vi.fn(), apiDelete: vi.fn() }));
vi.mock("../../../src/sidepanel/lib/crypto", () => ({ decryptContent: vi.fn() }));

import { apiGet } from "../../../src/sidepanel/lib/api";
const mockGet = apiGet as ReturnType<typeof vi.fn>;

describe("Materials Page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders title", () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<Materials />);
    expect(screen.getByText("素材库")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Materials />);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<Materials />);
    expect(await screen.findByText("暂无素材")).toBeInTheDocument();
    expect(screen.getByText("抓取网页内容后保存到素材库")).toBeInTheDocument();
  });
});
