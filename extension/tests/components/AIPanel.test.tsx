import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIPanel from "../../src/sidepanel/components/AIPanel";

describe("AIPanel", () => {
  it("renders all 6 action buttons", () => {
    render(<AIPanel onAction={() => {}} />);
    expect(screen.getByText(/AI 摘要/)).toBeInTheDocument();
    expect(screen.getByText(/要点提炼/)).toBeInTheDocument();
    expect(screen.getByText(/生成标题/)).toBeInTheDocument();
    expect(screen.getByText(/改写/)).toBeInTheDocument();
    expect(screen.getByText(/润色/)).toBeInTheDocument();
    expect(screen.getByText(/扩写/)).toBeInTheDocument();
  });

  it("renders section title", () => {
    render(<AIPanel onAction={() => {}} />);
    expect(screen.getByText("AI 工具")).toBeInTheDocument();
  });

  it("fires onAction with correct key on button click", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<AIPanel onAction={onAction} />);
    await user.click(screen.getByText(/AI 摘要/));
    expect(onAction).toHaveBeenCalledWith("summarize");
    await user.click(screen.getByText(/改写/));
    expect(onAction).toHaveBeenCalledWith("rewrite");
  });

  it("disables all buttons when loading is true", () => {
    render(<AIPanel onAction={() => {}} loading={true} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("enables all buttons when loading is false", () => {
    render(<AIPanel onAction={() => {}} loading={false} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toBeDisabled();
    }
  });
});
