import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "../../src/sidepanel/components/NavBar";

describe("NavBar", () => {
  it("renders all 7 navigation links", () => {
    render(<MemoryRouter><NavBar /></MemoryRouter>);
    expect(screen.getByText("抓取")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("素材")).toBeInTheDocument();
    expect(screen.getByText("图片")).toBeInTheDocument();
    expect(screen.getByText("发布")).toBeInTheDocument();
    expect(screen.getByText("数据")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("marks active link with red-500 color class", () => {
    render(
      <MemoryRouter initialEntries={["/scrape"]}>
        <NavBar />
      </MemoryRouter>,
    );
    const link = screen.getByText("抓取").closest("a");
    expect(link?.className).toContain("text-red-500");
  });

  it("renders icons for each tab", () => {
    render(<MemoryRouter><NavBar /></MemoryRouter>);
    expect(screen.getByText("🔍")).toBeInTheDocument();
    expect(screen.getByText("✏️")).toBeInTheDocument();
  });
});
