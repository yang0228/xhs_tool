import { readSettings } from "./settings";
import type { UserSettings } from "../../shared/types";

export type ApiIdentity = Pick<UserSettings, "backendUrl" | "apiKey">;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
function detailMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return `${Array.isArray(item.loc) ? item.loc.join(".") + ": " : ""}${item.msg}`;
        }
        return detailMessage(item) || "Invalid request";
      })
      .join("; ");
  if (detail && typeof detail === "object") return JSON.stringify(detail);
}

async function request<T>(
  path: string,
  method: string,
  body: unknown,
  consume: (response: Response, signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new ApiError("请求超时 (timeout)，请重试。", 0)),
    120_000,
  );
  try {
    const settings = await readSettings();
    if (
      expectedIdentity &&
      (settings.backendUrl !== expectedIdentity.backendUrl ||
        settings.apiKey !== expectedIdentity.apiKey)
    ) {
      throw new ApiError("账户或后端已切换，请重新打开草稿。", 0);
    }
    controller.signal.throwIfAborted();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.apiKey) headers.Authorization = "Bearer " + settings.apiKey;
    const response = await fetch(settings.backendUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail: unknown;
      try {
        detail = (await response.json()).detail;
      } catch {
        /* Non-JSON HTTP errors retain their status. */
      }
      throw new ApiError(
        detailMessage(detail) || "API error: " + response.status,
        response.status,
      );
    }
    const result = await consume(response, controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : "网络请求失败",
      0,
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  }
}
const jsonResponse = async <T>(response: Response): Promise<T> =>
  response.status === 204 ? (undefined as T) : response.json();
export function apiGet<T>(
  path: string,
  signal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<T> {
  return request(
    path,
    "GET",
    undefined,
    jsonResponse<T>,
    signal,
    expectedIdentity,
  );
}
export function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<T> {
  return request(path, "POST", body, jsonResponse<T>, signal, expectedIdentity);
}
export function apiPut<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<T> {
  return request(path, "PUT", body, jsonResponse<T>, signal, expectedIdentity);
}
export function apiDelete(
  path: string,
  signal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<void> {
  return request(
    path,
    "DELETE",
    undefined,
    async () => {},
    signal,
    expectedIdentity,
  );
}

export function apiPostStream(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  expectedIdentity?: ApiIdentity,
): Promise<string> {
  return request(
    path,
    "POST",
    body,
    async (response, requestSignal) => {
      const reader = response.body?.getReader();
      if (!reader) throw new ApiError("No response stream", 0);
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      requestSignal.addEventListener("abort", cancel, { once: true });
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let data: string[] = [];
      let event = "";
      let finished = false;
      const dispatch = () => {
        if (!data.length) {
          event = "";
          return;
        }
        const raw = data.join("\n");
        data = [];
        if (raw === "[DONE]") {
          finished = true;
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        if (
          event === "error" ||
          (parsed && typeof parsed === "object" && "error" in parsed)
        ) {
          const detail =
            parsed && typeof parsed === "object" && "error" in parsed
              ? parsed.error
              : parsed;
          throw new ApiError(detailMessage(detail) || "AI 生成失败", 0);
        }
        event = "";
        const chunk =
          typeof parsed === "string"
            ? parsed
            : parsed && typeof parsed === "object" && "chunk" in parsed
              ? parsed.chunk
              : "";
        if (typeof chunk === "string" && chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      };
      const line = (value: string) => {
        if (!value) {
          dispatch();
          return;
        }
        if (value.startsWith(":")) return;
        const colon = value.indexOf(":");
        const field = colon < 0 ? value : value.slice(0, colon);
        const text = colon < 0 ? "" : value.slice(colon + 1).replace(/^ /, "");
        if (field === "data") data.push(text);
        if (field === "event") event = text;
      };
      const drain = (atEnd: boolean) => {
        while (!finished) {
          const match = /\r\n|\r|\n/.exec(buffer);
          if (
            !match ||
            (!atEnd && match[0] === "\r" && match.index === buffer.length - 1)
          )
            break;
          line(buffer.slice(0, match.index));
          buffer = buffer.slice(match.index + match[0].length);
        }
        if (atEnd && !finished) {
          if (buffer) line(buffer);
          buffer = "";
          dispatch();
        }
      };
      try {
        requestSignal.throwIfAborted();
        while (!finished) {
          const { done, value } = await reader.read();
          requestSignal.throwIfAborted();
          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          drain(done);
          if (done) break;
        }
        return fullText;
      } finally {
        requestSignal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    signal,
    expectedIdentity,
  );
}
