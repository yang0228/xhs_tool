import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Editor from "../../../src/sidepanel/pages/Editor";
import { resetChromeMocks } from "../../mocks/chrome";
beforeEach(() => resetChromeMocks());
function mount() {
  return render(
    <MemoryRouter initialEntries={["/drafts/new"]}>
      <Routes>
        <Route path="/drafts/:id" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}
it("allows writing beyond publication limits without truncating drafts", async () => {
  mount();
  const content = await screen.findByLabelText("正文");
  const text = "长文".repeat(1000);
  fireEvent.change(content, { target: { value: text } });
  expect(content).toHaveValue(text);
  expect(screen.getByText(/正文 2000 字/)).toBeInTheDocument();
});
it("shows editor preview without changing source text", async () => {
  mount();
  const content = await screen.findByLabelText("正文");
  fireEvent.change(content, { target: { value: "保留这一段文字" } });
  fireEvent.click(screen.getByRole("button", { name: "预览笔记" }));
  expect(screen.getByText("保留这一段文字")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回编辑" }));
  expect(screen.getByLabelText("正文")).toHaveValue("保留这一段文字");
});
