import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiGet, apiPostStream, apiPut } from "../../../src/sidepanel/lib/api";
import { resetChromeMocks } from "../../mocks/chrome";
beforeEach(() => resetChromeMocks());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("exposes conflict status and FastAPI field validation detail", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [{ loc: ["body", "title"], msg: "Field required" }],
          }),
          { status: 422 },
        ),
      ),
  );
  await expect(apiPut("/drafts/1", {})).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining("title: Field required"),
  });
});
it("handles split multibyte SSE and stops at DONE even without final newline", async () => {
  const bytes = new TextEncoder().encode(
    'data:{"chunk":"中文🌟"}\r\n\r\ndata:[DONE]\r\n\r\ndata:{"chunk":"ignored"}',
  );
  const stream = new ReadableStream({
    start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
      c.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  const pieces: string[] = [];
  expect(await apiPostStream("/ai", {}, (chunk) => pieces.push(chunk))).toBe(
    "中文🌟",
  );
  expect(pieces).toEqual(["中文🌟"]);
});
it("rejects SSE error events rather than mixing them into text", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          'event: error\ndata: {"error":"Provider unavailable"}\n\n',
        ),
      ),
  );
  await expect(apiPostStream("/ai", {}, () => {})).rejects.toThrow(
    "Provider unavailable",
  );
});
it("processes a final event without newline", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('data: {"chunk":"last"}')),
  );
  expect(await apiPostStream("/ai", {}, () => {})).toBe("last");
});
it("cancels a stalled stream when the caller aborts", async () => {
  const controller = new AbortController();
  let cancelled = false;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
    ),
  );
  const result = apiPostStream("/ai", {}, () => {}, controller.signal);
  const rejection = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  controller.abort();
  await rejection;
  expect(cancelled).toBe(true);
});
it("times out requests that never respond", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(options.signal.reason),
          ),
        ),
    ),
  );
  const pending = apiGet("/stalled");
  const rejection = expect(pending).rejects.toMatchObject({
    status: 0,
    message: expect.stringMatching(/timeout|超时/i),
  });
  await vi.advanceTimersByTimeAsync(120_001);
  await rejection;
});
it("refuses a write when the caller's captured identity differs from current settings", async () => {
  const { saveSettings } = await import("../../../src/sidepanel/lib/settings");
  await saveSettings({
    apiKey: "new-owner",
    backendUrl: "https://new.test/api",
  });
  let backendWrites = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      backendWrites++;
      return Response.json({});
    }),
  );
  await expect(
    apiPut("/drafts/1", {}, undefined, {
      apiKey: "previous-owner",
      backendUrl: "https://old.test/api",
    }),
  ).rejects.toMatchObject({
    status: 0,
    message: expect.stringContaining("切换"),
  });
  expect(backendWrites).toBe(0);
});
