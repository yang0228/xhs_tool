import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardStudio from "../../src/sidepanel/components/CardStudio";
import type { CardDesign } from "../../src/sidepanel/lib/cards";

const initial: CardDesign = {
  template: "checklist",
  palette: "rose",
  source_signature: "old",
  pages: [
    { title: "封面", body: "" },
    { title: "正文", body: "第一段\n\n第二段" },
  ],
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: Array.from(s).length * 42 }),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
  });
});
afterEach(() => vi.restoreAllMocks());

function Editor() {
  const [value, setValue] = useState<CardDesign | undefined>(initial);
  return (
    <>
      <CardStudio
        title="新标题"
        content="新正文"
        imageIds={["image-1"]}
        value={value}
        onChange={setValue}
      />
      <output data-testid="saved">{JSON.stringify(value)}</output>
    </>
  );
}

it("stores manual edits, split pages and order only through the controlled draft value", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("第 2 页标题"), {
    target: { value: "人工标题" },
  });
  fireEvent.change(screen.getByLabelText("第 2 页正文"), {
    target: { value: "先准备\n\n再动手" },
  });
  await user.click(screen.getByRole("button", { name: "拆分第 2 页" }));
  let saved = JSON.parse(screen.getByTestId("saved").textContent!);
  expect(saved.pages).toEqual([
    { title: "封面", body: "" },
    { title: "人工标题", body: "先准备\n\n" },
    { title: "人工标题（续）", body: "再动手" },
  ]);
  await user.click(screen.getByRole("button", { name: "第 3 页上移" }));
  saved = JSON.parse(screen.getByTestId("saved").textContent!);
  expect(saved.pages[1].body).toBe("再动手");
  await user.selectOptions(screen.getByLabelText("卡片模板"), "steps");
  await user.selectOptions(screen.getByLabelText("卡片配色"), "sage");
  await user.selectOptions(screen.getByLabelText("第 2 页配图"), "image-1");
  saved = JSON.parse(screen.getByTestId("saved").textContent!);
  expect(saved.template).toBe("steps");
  expect(saved.palette).toBe("sage");
  expect(saved.pages[1].image_id).toBe("image-1");
});

it("regenerates from the current article and clears the stale warning", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await screen.findByText(/正文或标题已变化/);
  await user.click(
    screen.getByRole("button", { name: "从当前标题和正文生成" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("第 1 页标题")).toHaveValue("新标题"),
  );
  expect(screen.getByLabelText("第 2 页正文")).toHaveValue("新正文");
  expect(screen.queryByText(/正文或标题已变化/)).not.toBeInTheDocument();
  expect(
    JSON.parse(screen.getByTestId("saved").textContent!).source_signature,
  ).toMatch(/^[0-9a-f]{64}$/);
});

it("offers an explicit recovery when a card references an unavailable selected image", () => {
  render(
    <CardStudio
      title="标题"
      content="正文"
      imageIds={[]}
      value={{
        ...initial,
        pages: [{ title: "封面", body: "", image_id: "removed" }],
      }}
      onChange={() => {}}
    />,
  );
  const select = screen.getByLabelText("第 1 页配图");
  expect(
    within(select).getByRole("option", { name: /配图已不在当前选择/ }),
  ).toBeInTheDocument();
  expect(
    within(select).getByRole("option", { name: "无配图" }),
  ).toBeInTheDocument();
});

it("shows an overflow error and offers no PNG download for a failed preview", async () => {
  const user = userEvent.setup();
  render(
    <CardStudio
      title="标题"
      content="正文"
      imageIds={[]}
      value={{
        ...initial,
        pages: [{ title: "封面", body: "超出\n".repeat(100) }],
      }}
      onChange={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/正文溢出/);
  expect(
    screen.queryByRole("button", { name: /下载.*PNG/ }),
  ).not.toBeInTheDocument();
});
