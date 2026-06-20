import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Materials from "../../src/sidepanel/pages/Materials";
import { encryptContent } from "../../src/sidepanel/lib/crypto";
import { resetChromeMocks } from "../mocks/chrome";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("searches decrypted content beyond the first server page", async () => {
  resetChromeMocks();
  const first = await encryptContent(
    JSON.stringify({ format: 2, title: "普通素材", content: "日常记录" }),
  );
  const last = await encryptContent(
    JSON.stringify({
      format: 2,
      title: "深页素材",
      content: "隐藏在最后一页的搜寻目标",
    }),
  );
  const records = Array.from({ length: 105 }, (_, index) => {
    const enc = index === 104 ? last : first;
    return {
      id: String(index),
      encrypted_content: enc.ciphertext,
      encryption_iv: enc.iv,
      encryption_salt: enc.salt,
      tags: [],
      created_at: "2026-09-25T00:00:00Z",
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      const page = Number(url.searchParams.get("page"));
      const limit = Number(url.searchParams.get("limit"));
      return Response.json({
        items: records.slice((page - 1) * limit, page * limit),
        total: 105,
        page,
      });
    }),
  );
  render(
    <MemoryRouter>
      <Materials />
    </MemoryRouter>,
  );
  await screen.findAllByText("普通素材", { exact: true });
  fireEvent.change(screen.getByRole("textbox", { name: /搜索/ }), {
    target: { value: "搜寻目标" },
  });
  await screen.findByText("深页素材", { exact: true });
  expect(
    screen.queryByText("普通素材", { exact: true }),
  ).not.toBeInTheDocument();
});
