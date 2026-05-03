import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import RagSettings from "../../src/sidepanel/components/RagSettings";
import { resetChromeMocks } from "../mocks/chrome";

beforeEach(() => resetChromeMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows the checkbox choice immediately while storage is pending, reverting on failure", async () => {
  render(<RagSettings />);
  const checkbox = screen.getByRole("checkbox", {
    name: "允许 RAG 保存所选素材的明文副本",
  });
  await waitFor(() => expect(checkbox).toBeEnabled());
  let reject!: (error: Error) => void;
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  await waitFor(() => expect(reject).toBeDefined());
  reject(new Error("写入失败"));
  await screen.findByRole("alert");
  expect(checkbox).not.toBeChecked();
});
