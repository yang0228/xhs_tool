import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, apiPost, apiPut, apiDelete, apiPostStream } from "../../../src/sidepanel/lib/api";
import { chrome, resetChromeMocks } from "../../mocks/chrome";

function seedSettings(overrides?: Record<string, unknown>) {
  chrome.storage.local.set({
    settings: {
      backendUrl: "https://api.example.com",
      apiKey: "test-api-key",
      ...overrides,
    },
  });
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("api", () => {
  beforeEach(() => {
    resetChromeMocks();
    seedSettings();
  });

  describe("apiGet", () => {
    it("fetches with auth headers and returns json", async () => {
      const fetch = mockFetch(200, { data: "ok" });
      vi.stubGlobal("fetch", fetch);

      const result = await apiGet("/test");

      expect(result).toEqual({ data: "ok" });
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.example.com/test");
      expect(init.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      });
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(404, {}));
      await expect(apiGet("/missing")).rejects.toThrow("API error: 404");
    });

    it("falls back to default URL when no backendUrl in settings", async () => {
      resetChromeMocks();
      chrome.storage.local.set({ settings: { backendUrl: "", apiKey: "" } });
      const fetch = mockFetch(200, { data: "ok" });
      vi.stubGlobal("fetch", fetch);

      await apiGet("/test");
      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toBe("http://localhost:8000/api/test");
    });
  });

  describe("apiPost", () => {
    it("sends POST with JSON body", async () => {
      const fetch = mockFetch(200, { id: 1 });
      vi.stubGlobal("fetch", fetch);

      const result = await apiPost("/items", { name: "test" });
      expect(result).toEqual({ id: 1 });

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ name: "test" }));
    });

    it("extracts detail from error response", async () => {
      const fetch = mockFetch(422, { detail: "Validation failed" });
      vi.stubGlobal("fetch", fetch);

      await expect(apiPost("/items", {})).rejects.toThrow("Validation failed");
    });

    it("falls back to status code if error has no detail", async () => {
      vi.stubGlobal("fetch", mockFetch(500, {}));
      await expect(apiPost("/items", {})).rejects.toThrow("API error: 500");
    });
  });

  describe("apiPut", () => {
    it("sends PUT with JSON body", async () => {
      const fetch = mockFetch(200, { updated: true });
      vi.stubGlobal("fetch", fetch);

      await apiPut("/items/1", { name: "updated" });
      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("PUT");
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(403, {}));
      await expect(apiPut("/items/1", {})).rejects.toThrow("API error: 403");
    });
  });

  describe("apiDelete", () => {
    it("sends DELETE and resolves on success", async () => {
      const fetch = mockFetch(204, null);
      vi.stubGlobal("fetch", fetch);

      await expect(apiDelete("/items/1")).resolves.toBeUndefined();
      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(500, {}));
      await expect(apiDelete("/items/1")).rejects.toThrow("API error: 500");
    });
  });

  describe("apiPostStream", () => {
    it("parses SSE stream and accumulates full text", async () => {
      const chunks: string[] = [];
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"chunk":"Hello"}\n\ndata: {"chunk":" World"}\n\ndata: [DONE]\n\n',
            ),
          );
          controller.close();
        },
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, status: 200, body: stream,
      }));

      const result = await apiPostStream("/stream", { prompt: "hi" }, (t: string) => chunks.push(t));
      expect(result).toBe("Hello World");
      expect(chunks).toEqual(["Hello", " World"]);
    });

    it("handles non-JSON data lines as raw text", async () => {
      const chunks: string[] = [];
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: raw text\n\n"));
          controller.close();
        },
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, status: 200, body: stream,
      }));

      const result = await apiPostStream("/stream", {}, (t: string) => chunks.push(t));
      expect(result).toBe("raw text");
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false, status: 500, body: null,
      }));
      await expect(apiPostStream("/stream", {}, () => {})).rejects.toThrow("API error: 500");
    });

    it("throws when response has no body", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, status: 200, body: null,
      }));
      await expect(apiPostStream("/stream", {}, () => {})).rejects.toThrow("No response stream");
    });
  });
});
