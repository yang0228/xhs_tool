import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Images from "../../../src/sidepanel/pages/Images";
import { resetChromeMocks } from "../../mocks/chrome";

beforeEach(async () => {
  resetChromeMocks();
  await chrome.storage.local.set({
    settings: { backendUrl: "http://localhost:8000/api", apiKey: "owner" },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const image = {
  id: "image-1",
  r2_key: "users/owner/image-1/picture.png",
  r2_url: "https://private.test/picture.png",
  original_filename: "picture.png",
  mime_type: "image/png",
  file_size_bytes: 4,
  width: 300,
  height: 200,
  created_at: "2026-09-25",
};
const show = () =>
  render(
    <MemoryRouter>
      <Images />
    </MemoryRouter>,
  );

it("failed storage PUT never confirms a nonexistent upload and permits retry", async () => {
  let confirmations = 0;
  let putAttempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("upload-url"))
        return Response.json({
          upload_url: "https://upload.test/file",
          r2_key: "users/owner/file",
        });
      if (url === "https://upload.test/file") {
        putAttempts++;
        return new Response("", { status: 503 });
      }
      if (url.endsWith("/confirm")) {
        confirmations++;
        return Response.json(image);
      }
      return Response.json({ items: [], total: 0, page: 1 });
    }),
  );
  const view = show();
  await screen.findByText("暂无图片");
  const input = view.container.querySelector("input[type=file]")!;
  fireEvent.change(input, {
    target: { files: [new File(["data"], "photo.png", { type: "image/png" })] },
  });
  await screen.findByRole("alert");
  expect(confirmations).toBe(0);
  expect(screen.getByRole("alert")).toHaveTextContent("503");
  fireEvent.change(input, {
    target: { files: [new File(["data"], "photo.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(putAttempts).toBe(2));
});

it("rejects unsupported file types before requesting storage", async () => {
  let uploadRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("upload-url")) uploadRequests++;
      return Response.json({ items: [], total: 0 });
    }),
  );
  const view = show();
  await screen.findByText("暂无图片");
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: { files: [new File(["text"], "text.txt", { type: "text/plain" })] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("PNG");
  expect(uploadRequests).toBe(0);
});

it("renders a signed private preview and paginates twenty images", async () => {
  const pages: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/download-url"))
        return Response.json({
          download_url: "https://signed.test/image?token=one",
          expires_in: 3600,
        });
      pages.push(url);
      return Response.json({
        items: [image],
        total: 21,
        page: url.includes("page=2") ? 2 : 1,
      });
    }),
  );
  show();
  expect(
    await screen.findByRole("img", { name: "picture.png" }),
  ).toHaveAttribute("src", "https://signed.test/image?token=one");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(pages.some((p) => p.endsWith("/images?page=2&limit=20"))).toBe(true),
  );
});

it("requires deletion confirmation and keeps the image visible on storage failure", async () => {
  let deletes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deletes++;
        return Response.json(
          { detail: "Storage unavailable" },
          { status: 502 },
        );
      }
      if (url.includes("/download-url"))
        return Response.json({ download_url: "https://signed.test/image" });
      return Response.json({ items: [image], total: 1 });
    }),
  );
  show();
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("button", { name: "删除" }));
  expect(deletes).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Storage unavailable",
  );
  expect(screen.getByRole("img")).toBeInTheDocument();
});

it("aborts list requests when leaving the page", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => {});
    }),
  );
  const view = show();
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("successful upload confirms the object only after PUT and displays success", async () => {
  let uploaded = false;
  let confirmed: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("upload-url"))
        return Response.json({
          upload_url: "https://upload.test/success",
          r2_key: "users/owner/new.png",
        });
      if (url === "https://upload.test/success") {
        uploaded = true;
        return new Response("", { status: 200 });
      }
      if (url.endsWith("/confirm")) {
        expect(uploaded).toBe(true);
        confirmed = JSON.parse(String(init?.body));
        return Response.json(image);
      }
      return Response.json({ items: [], total: 0, page: 1 });
    }),
  );
  const view = show();
  await screen.findByText("暂无图片");
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: { files: [new File(["data"], "photo.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("status")).toHaveTextContent(/正在|成功/);
  await screen.findByText("图片上传成功");
  expect(confirmed.r2_key).toBe("users/owner/new.png");
});

it("aborts a pending storage upload when leaving without confirming", async () => {
  let signal: AbortSignal | undefined;
  let confirmations = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("upload-url"))
        return Response.json({
          upload_url: "https://upload.test/pending",
          r2_key: "users/owner/new.png",
        });
      if (url === "https://upload.test/pending") {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(signal!.reason)),
        );
      }
      if (url.endsWith("/confirm")) confirmations++;
      return Response.json({ items: [], total: 0, page: 1 });
    }),
  );
  const view = show();
  await screen.findByText("暂无图片");
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: { files: [new File(["data"], "photo.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
  expect(confirmations).toBe(0);
});
