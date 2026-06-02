import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagInput from "../../src/sidepanel/components/TagInput";

describe("TagInput", () => {
  it("renders existing tags", () => {
    render(<TagInput tags={["react", "typescript"]} onChange={() => {}} />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("renders an input with placeholder", () => {
    render(<TagInput tags={[]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("输入标签，回车添加")).toBeInTheDocument();
  });

  it("adds a tag on Enter", async () => {
    const user = userEvent.setup();
    let tags: string[] = [];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const input = screen.getByPlaceholderText("输入标签，回车添加");
    await user.type(input, "new-tag{Enter}");
    expect(tags).toEqual(["new-tag"]);
  });

  it("adds a tag on comma", async () => {
    const user = userEvent.setup();
    let tags: string[] = [];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const input = screen.getByPlaceholderText("输入标签，回车添加");
    await user.type(input, "new-tag,");
    expect(tags).toEqual(["new-tag"]);
  });

  it("prevents duplicate tags", async () => {
    const user = userEvent.setup();
    let tags = ["existing"];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const input = screen.getByPlaceholderText("输入标签，回车添加");
    await user.type(input, "existing{Enter}");
    expect(tags).toEqual(["existing"]);
  });

  it("trims whitespace from tags", async () => {
    const user = userEvent.setup();
    let tags: string[] = [];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const input = screen.getByPlaceholderText("输入标签，回车添加");
    await user.type(input, "  spaced  {Enter}");
    expect(tags).toEqual(["spaced"]);
  });

  it("ignores empty input", async () => {
    const user = userEvent.setup();
    let tags: string[] = [];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const input = screen.getByPlaceholderText("输入标签，回车添加");
    await user.type(input, "{Enter}");
    expect(tags).toEqual([]);
  });

  it("removes a tag on × click", async () => {
    const user = userEvent.setup();
    let tags = ["a", "b", "c"];
    const onChange = (newTags: string[]) => { tags = newTags; };

    render(<TagInput tags={tags} onChange={onChange} />);
    const removeButtons = screen.getAllByText("×");
    await user.click(removeButtons[1]);
    expect(tags).toEqual(["a", "c"]);
  });
});
