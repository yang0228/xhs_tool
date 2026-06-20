import {
  act,
  cleanup,
  renderHook,
  waitFor,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import Editor from "../../src/sidepanel/pages/Editor";
import { useDraftEditor } from "../../src/sidepanel/hooks/useDraftEditor";
import * as drafts from "../../src/sidepanel/lib/drafts";
import { saveSettings } from "../../src/sidepanel/lib/settings";
import type { Draft } from "../../src/shared/types";
import { resetChromeMocks } from "../mocks/chrome";

let records: Record<string, Draft>;
let owners: Record<string, string>;
const originalEncode = drafts.encodeDraft;
const doc = (content: string) => ({
  title: content + " title",
  content,
  image_ids: [],
});
beforeEach(async () => {
  resetChromeMocks();
  records = {};
  owners = {};
  await saveSettings({ apiKey: "owner-a", backendUrl: "https://api.test/api" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path === "/api/drafts" && init?.method === "POST") {
        const id = body.client_id;
        records[id] ||= { ...body, id, version: 1 };
        owners[id] = new Headers(init.headers).get("Authorization") || "";
        return Response.json(records[id]);
      }
      const id = path.split("/").pop()!;
      if (init?.method === "PUT") {
        if (records[id].version !== body.expected_version)
          return Response.json({ detail: "conflict" }, { status: 409 });
        records[id] = {
          ...records[id],
          ...body,
          version: records[id].version + 1,
        };
      }
      return records[id]
        ? Response.json(records[id])
        : Response.json({ detail: "missing" }, { status: 404 });
    }),
  );
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await drafts.loadRecovery("new").catch(() => {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function seed(id: string, content: string) {
  records[id] = {
    ...(await originalEncode(doc(content))),
    id,
    version: 1,
  } as Draft;
}
function pauseNextEncode() {
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  vi.spyOn(drafts, "encodeDraft").mockImplementationOnce(async (document) => {
    entered = true;
    await pause;
    return originalEncode(document);
  });
  return { release, entered: () => entered };
}
it("does not overwrite a newly opened draft with the previous draft save", async () => {
  await seed("a", "A original");
  await seed("b", "B original");
  const hook = renderHook(({ id }) => useDraftEditor(id), {
    initialProps: { id: "a" },
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setDoc(doc("A edited")));
  const encoding = pauseNextEncode();
  let saving!: Promise<string | null>;
  act(() => {
    saving = hook.result.current.save();
  });
  await waitFor(() => expect(encoding.entered()).toBe(true));
  hook.rerender({ id: "b" });
  await waitFor(() =>
    expect(hook.result.current.doc.content).toBe("B original"),
  );
  await act(async () => {
    encoding.release();
    await saving;
  });
  expect((await drafts.decodeDraft(records.b)).content).toBe("B original");
});
it("does not send a pending draft to a newly configured account", async () => {
  const hook = renderHook(() => useDraftEditor("new"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setDoc(doc("private owner A note")));
  const encoding = pauseNextEncode();
  let saving!: Promise<string | null>;
  act(() => {
    saving = hook.result.current.save();
  });
  await waitFor(() => expect(encoding.entered()).toBe(true));
  await saveSettings({ apiKey: "owner-b" });
  await act(async () => {
    encoding.release();
    await saving;
  });
  expect(Object.values(owners)).not.toContain("Bearer owner-b");
});
it("handles a new material seed on the same new-draft route", async () => {
  const hook = renderHook(({ seed }) => useDraftEditor("new", seed), {
    initialProps: { seed: doc("first material") },
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.rerender({ seed: doc("second material") });
  await waitFor(() =>
    expect(hook.result.current.doc.content).toBe("second material"),
  );
});
it("preserves conflicting cached edits across leaving and reopening the editor", async () => {
  await seed("a", "server version two");
  records.a.version = 2;
  await drafts.saveRecovery("a", {
    ...doc("unmerged local edits"),
    id: "a",
    version: 1,
  });
  const hook = renderHook(() => useDraftEditor("a"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.recoveryConflict?.content).toBe(
    "unmerged local edits",
  );
  hook.unmount();
  // Wait for the navigation flush to finish before opening another editor instance.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const reopened = renderHook(() => useDraftEditor("a"));
  await waitFor(() => expect(reopened.result.current.ready).toBe(true));
  expect([
    reopened.result.current.doc.content,
    reopened.result.current.recoveryConflict?.content,
  ]).toContain("unmerged local edits");
});
it("does not cache the previous document under a route that failed to load", async () => {
  await seed("a", "A original");
  const hook = renderHook(({ id }) => useDraftEditor(id), {
    initialProps: { id: "a" },
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.rerender({ id: "missing-b" });
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  hook.unmount();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(await drafts.loadRecovery("missing-b")).toBeNull();
});
it("preserves newer edits when retrying a copy whose server response was lost", async () => {
  await seed("a", "original");
  const hook = renderHook(() => useDraftEditor("a"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  records.a.version = 2;
  act(() => hook.result.current.setDoc(doc("first local copy")));
  await act(async () => {
    await hook.result.current.save();
  });
  const server = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementationOnce(async (...args) => {
    await server(...args);
    throw new Error("response lost after commit");
  });
  await act(async () => {
    expect(await hook.result.current.recoverAsCopy()).toBeNull();
  });
  act(() => hook.result.current.setDoc(doc("newer local edits")));
  let restored: string | null = null;
  await act(async () => {
    restored = await hook.result.current.recoverAsCopy();
  });
  // An idempotent retry may return the first copy; it must not claim newer text is saved.
  expect(restored).toBeNull();
  expect(hook.result.current.doc.content).toBe("newer local edits");
});
it("does not carry an AI undo document from one draft into another", async () => {
  await seed("a", "A original");
  await seed("b", "B original");
  const server = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) =>
    String(args[0]).includes("/ai/polish")
      ? Response.json({ polished: "A polished" })
      : server(...args),
  );
  render(
    <MemoryRouter initialEntries={["/drafts/a"]}>
      <Link to="/drafts/b">Open B</Link>
      <Routes>
        <Route path="/drafts/:id" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("A original");
  fireEvent.click(screen.getByRole("button", { name: "AI 润色" }));
  await screen.findByText("A polished");
  fireEvent.click(screen.getByRole("button", { name: "采用建议" }));
  expect(
    screen.getByRole("button", { name: "撤销 AI 修改" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Open B" }));
  await screen.findByDisplayValue("B original");
  expect(
    screen.queryByRole("button", { name: "撤销 AI 修改" }),
  ).not.toBeInTheDocument();
});
it("does not overwrite a reopened draft recovery with a late save response", async () => {
  await seed("a", "A original");
  await seed("b", "B original");
  const backend = vi.mocked(fetch).getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await backend(input, init);
    if (
      String(input).endsWith("/drafts/a") &&
      init?.method === "PUT" &&
      !received
    ) {
      received = true;
      await held;
    }
    return response;
  });
  const hook = renderHook(({ id }) => useDraftEditor(id), {
    initialProps: { id: "a" },
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setDoc(doc("first saved edit")));
  let saving!: Promise<string | null>;
  act(() => {
    saving = hook.result.current.save();
  });
  await waitFor(() => expect(received).toBe(true));
  hook.rerender({ id: "b" });
  await waitFor(() =>
    expect(hook.result.current.doc.content).toBe("B original"),
  );
  hook.rerender({ id: "a" });
  await waitFor(() =>
    expect(hook.result.current.doc.content).toBe("first saved edit"),
  );
  act(() => hook.result.current.setDoc(doc("newer unsynced edit")));
  await waitFor(async () =>
    expect((await drafts.loadRecovery("a"))?.content).toBe(
      "newer unsynced edit",
    ),
  );
  await act(async () => {
    release();
    await saving;
  });
  expect((await drafts.loadRecovery("a"))?.content).toBe("newer unsynced edit");
});
