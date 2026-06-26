import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const extension = path.resolve("dist");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      viewport: { width: 390, height: 844 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    const drafts = new Map<string, Record<string, unknown>>();
    const materials: Record<string, unknown>[] = [];
    const posts: Record<string, unknown>[] = [];
    await context.route("http://localhost:8000/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const body = request.postDataJSON() || {};
      let data: unknown = { detail: "Not found" };
      let status = 200;
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
      if (url.pathname === "/api/health") data = { status: "ok" };
      else if (url.pathname === "/api/auth/verify")
        data = { valid: true, user_id: "test-user" };
      else if (url.pathname === "/api/drafts" && method === "POST") {
        const id = body.client_id;
        const now = new Date().toISOString();
        if (!drafts.has(id))
          drafts.set(id, {
            ...body,
            id,
            user_id: "test-user",
            version: 1,
            created_at: now,
            updated_at: now,
          });
        data = drafts.get(id);
      } else if (url.pathname === "/api/drafts" && method === "GET")
        data = { items: [...drafts.values()], total: drafts.size, page: 1 };
      else if (url.pathname.startsWith("/api/drafts/")) {
        const id = url.pathname.split("/").pop()!;
        const current = drafts.get(id);
        if (!current) {
          status = 404;
        } else if (method === "PUT") {
          if (body.expected_version !== current.version) {
            status = 409;
            data = { detail: "版本冲突" };
          } else {
            data = {
              ...current,
              ...body,
              version: Number(current.version) + 1,
            };
            drafts.set(id, data as Record<string, unknown>);
          }
        } else data = current;
      } else if (url.pathname === "/api/materials" && method === "POST") {
        const item = {
          ...body,
          id: "material-" + materials.length,
          created_at: new Date().toISOString(),
        };
        materials.push(item);
        data = item;
      } else if (url.pathname === "/api/materials")
        data = { items: materials, total: materials.length, page: 1 };
      else if (url.pathname === "/api/images")
        data = { items: [], total: 0, page: 1 };
      else if (url.pathname === "/api/publish/posts")
        data = { items: posts, total: posts.length, page: 1 };
      else if (url.pathname === "/api/publish/records") {
        const item = {
          ...body,
          id: "post-" + posts.length,
          published_at: new Date().toISOString(),
        };
        posts.push(item);
        data = item;
      } else if (url.pathname === "/api/analytics/posts") data = { posts: [] };
      else if (url.pathname === "/api/ai/polish")
        data = { polished: "打磨后的文字，仍然保留真实体验。" };
      else if (url.pathname === "/api/ai/outline")
        data = { outline: [{ section: "开篇", key_points: ["整理真实体验"] }] };
      else status = 404;
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data),
      });
    });
    await use(context);
    await context.close();
  },
});
export { expect } from "@playwright/test";
