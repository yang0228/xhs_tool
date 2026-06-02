import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Analytics from "../../src/sidepanel/pages/Analytics";

describe("Analytics", () => {
  it("renders page title", () => {
    render(<Analytics />);
    expect(screen.getByText("数据分析")).toBeInTheDocument();
  });

  it("renders all 4 metric cards", () => {
    render(<Analytics />);
    expect(screen.getByText("阅读")).toBeInTheDocument();
    expect(screen.getByText("点赞")).toBeInTheDocument();
    expect(screen.getByText("收藏")).toBeInTheDocument();
    expect(screen.getByText("评论")).toBeInTheDocument();
  });

  it("renders placeholder dash for each metric", () => {
    render(<Analytics />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("renders empty state message", () => {
    render(<Analytics />);
    expect(screen.getByText("发布内容后数据将显示在此处")).toBeInTheDocument();
  });
});
