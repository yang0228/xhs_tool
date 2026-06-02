import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContentCard from "../../src/sidepanel/components/ContentCard";

describe("ContentCard", () => {
  const baseProps = {
    title: "Test Article Title That Is Quite Long And Should Be Truncated",
    preview: "This is a preview of the content.",
    date: "2024-01-15T10:30:00Z",
  };

  it("renders truncated title", () => {
    render(<ContentCard {...baseProps} />);
    expect(screen.getByText(/Test Article/)).toBeInTheDocument();
  });

  it("renders preview text", () => {
    render(<ContentCard {...baseProps} />);
    expect(screen.getByText("This is a preview of the content.")).toBeInTheDocument();
  });

  it("renders formatted date", () => {
    render(<ContentCard {...baseProps} />);
    expect(screen.getByText(/\d/)).toBeInTheDocument();
  });

  it("renders URL hostname when url is provided", () => {
    render(<ContentCard {...baseProps} url="https://example.com/page" />);
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("does not render URL when url is null", () => {
    render(<ContentCard {...baseProps} url={null} />);
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
  });

  it("renders tags when provided", () => {
    render(<ContentCard {...baseProps} tags={["tag1", "tag2"]} />);
    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("tag2")).toBeInTheDocument();
  });

  it("does not render tags area when empty", () => {
    render(<ContentCard {...baseProps} tags={[]} />);
    expect(screen.queryByText("tag1")).not.toBeInTheDocument();
  });

  it("fires onClick when card is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ContentCard {...baseProps} onClick={onClick} />);
    await user.click(screen.getByText(/Test Article/));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onDelete and stops propagation when × is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(<ContentCard {...baseProps} onClick={onClick} onDelete={onDelete} />);
    await user.click(screen.getByText("✕"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not render delete button when onDelete is not provided", () => {
    render(<ContentCard {...baseProps} />);
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });
});
