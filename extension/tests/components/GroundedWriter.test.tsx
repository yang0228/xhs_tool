import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import GroundedWriter from "../../src/sidepanel/components/GroundedWriter";
import { resetChromeMocks } from "../mocks/chrome";
import { useState } from "react";
import { emptyContext } from "../../src/sidepanel/lib/creator";
import type { DraftDocument } from "../../src/sidepanel/lib/drafts";

beforeEach(() => resetChromeMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const source = (id: string) => ({
  id,
  material_id: "material",
  content_hash: "hash",
  title: "素材" + id,
  url: null,
  content: "原文依据" + id,
});

it("marks a deleted original unavailable while retaining its quotation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ detail: "Material not found" }, { status: 404 }),
    ),
  );
  function Saved() {
    const [doc, setDoc] = useState<DraftDocument>({
      title: "选题",
      content: "正文[1]",
      image_ids: [],
      context: {
        ...emptyContext(),
        references: [{ ...source("a"), verified: true }],
      },
    });
    return (
      <GroundedWriter
        doc={doc}
        onApply={vi.fn()}
        onUpdateReferences={(update) =>
          setDoc((current) => ({
            ...current,
            context: {
              ...current.context!,
              references: update(current.context!.references),
            },
          }))
        }
      />
    );
  }
  render(<Saved />);
  fireEvent.click(screen.getByText("已保存的素材依据 · 1"));
  fireEvent.click(screen.getByRole("button", { name: "复核已保存来源" }));
  await screen.findByText("原素材已不可访问，已保留引用原文。");
  expect(screen.getByText("原文依据a")).toBeInTheDocument();
  expect(screen.getByText(/待复核/)).toBeInTheDocument();
});

it("uses only selected retrieved sources and requires explicit completed adoption", async () => {
  let request: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/rag/retrieve"))
        return Response.json({ sources: [source("a"), source("b")] });
      request = JSON.parse(String(init?.body));
      return new Response(
        'data: {"chunk":"有依据的提纲[1]"}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }),
  );
  const apply = vi.fn();
  render(
    <GroundedWriter
      doc={{ title: "选题", content: "", image_ids: [] }}
      onApply={apply}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "检索素材" }));
  const second = await screen.findByRole("checkbox", { name: "[2] 素材b" });
  fireEvent.click(second);
  fireEvent.click(screen.getByRole("button", { name: "生成带引用提纲" }));
  await screen.findByText("有依据的提纲[1]");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "采用带引用建议" }),
    ).toBeEnabled(),
  );
  expect(apply).not.toHaveBeenCalled();
  expect(request.source_ids).toEqual(["a"]);
  fireEvent.click(screen.getByRole("button", { name: "采用带引用建议" }));
  expect(apply).toHaveBeenCalledWith("有依据的提纲[1]", [
    { ...source("a"), verified: true },
  ]);
});

it("keeps partial text but blocks adoption when source validation fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      input.endsWith("/rag/retrieve")
        ? Response.json({ sources: [source("a")] })
        : new Response(
            'data: {"chunk":"不完整[99]"}\n\ndata: {"error":"引用编号无效"}\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          ),
    ),
  );
  render(
    <GroundedWriter
      doc={{ title: "选题", content: "", image_ids: [] }}
      onApply={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "生成带引用正文" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("引用编号无效");
  expect(screen.getByRole("button", { name: "采用带引用建议" })).toBeDisabled();
});

it("shows missing evidence instead of invoking grounded generation with empty sources", async () => {
  const fetcher = vi.fn(async () => Response.json({ sources: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <GroundedWriter
      doc={{ title: "选题", content: "", image_ids: [] }}
      onApply={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "生成带引用正文" }));
  await screen.findByRole("alert");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "采用带引用建议" }),
  ).not.toBeInTheDocument();
});
