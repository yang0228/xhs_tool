import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Publish from "../../../src/sidepanel/pages/Publish";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers manual publishing preparation without a nonfunctional cookie capture", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], total: 0, page: 1 })),
  );
  render(
    <MemoryRouter>
      <Publish />
    </MemoryRouter>,
  );
  expect(await screen.findByText("暂无发布记录")).toBeInTheDocument();
  expect(screen.getByLabelText("选择草稿")).toBeInTheDocument();
  expect(screen.queryByText("捕获 XHS 会话")).not.toBeInTheDocument();
});
