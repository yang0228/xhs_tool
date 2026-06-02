import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Drafts from "../../../src/sidepanel/pages/Drafts";

vi.mock("../../../src/sidepanel/lib/api", () => ({ apiGet: vi.fn(), apiDelete: vi.fn() }));
vi.mock("../../../src/sidepanel/lib/crypto", () => ({ decryptContent: vi.fn() }));

import { apiGet } from "../../../src/sidepanel/lib/api";
const mockGet = apiGet as ReturnType<typeof vi.fn>;

describe("Drafts Page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders title and new button", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<MemoryRouter><Drafts /></MemoryRouter>);
    expect(await screen.findByText("新建")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><Drafts /></MemoryRouter>);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    render(<MemoryRouter><Drafts /></MemoryRouter>);
    expect(await screen.findByText("暂无草稿")).toBeInTheDocument();
  });
});
