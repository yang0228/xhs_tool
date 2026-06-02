async function getBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get(["settings"]);
  return result.settings?.backendUrl || "http://localhost:8000/api";
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const result = await chrome.storage.local.get(["settings"]);
  const apiKey: string = result.settings?.apiKey || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = "Bearer " + apiKey;
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const base = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(base + path, { headers });
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const base = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(base + path, {
    method: "POST", headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "API error: " + res.status);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const base = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(base + path, {
    method: "PUT", headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const base = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(base + path, { method: "DELETE", headers });
  if (!res.ok) throw new Error("API error: " + res.status);
}

// SSE stream: calls onChunk with each text chunk, resolves with full text when done
export async function apiPostStream(
  path: string, body: unknown, onChunk: (text: string) => void
): Promise<string> {
  const base = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("API error: " + res.status);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines: "data: {...}\n\n"
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.chunk || "";
          fullText += chunk;
          onChunk(chunk);
        } catch {
          fullText += data;
          onChunk(data);
        }
      }
    }
  }

  return fullText;
}
