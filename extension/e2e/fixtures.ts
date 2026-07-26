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
    const indexed = new Map<
      string,
      { title: string; content: string; content_hash: string }
    >();
    const metrics = new Map<string, Record<string, unknown>[]>();
    let profile: { encrypted_profile: unknown; version: number } = {
      encrypted_profile: null,
      version: 0,
    };
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
      else if (url.pathname === "/api/profile") {
        if (method === "PUT") {
          if (body.expected_version !== profile.version) {
            status = 409;
            data = { detail: "档案版本冲突" };
          } else {
            profile = {
              encrypted_profile: body.encrypted_profile,
              version: profile.version + 1,
            };
            data = profile;
          }
        } else data = profile;
      } else if (url.pathname === "/api/rag/status")
        data = { configured: true, enabled: true, message: "测试知识库已连接" };
      else if (url.pathname === "/api/rag/cleanup")
        data = method === "POST" ? { remaining: 0 } : { items: [] };
      else if (/^\/api\/materials\/[^/]+\/rag$/.test(url.pathname)) {
        const id = url.pathname.split("/")[3];
        if (method === "POST") indexed.set(id, body);
        if (method === "DELETE") indexed.delete(id);
        data = { status: indexed.has(id) ? "ready" : "unindexed" };
      } else if (url.pathname === "/api/rag/retrieve")
        data = {
          sources: [...indexed]
            .map(([id, value]) => ({
              id: "chunk-" + id,
              material_id: id,
              content_hash: value.content_hash,
              title: value.title,
              url: null,
              content: value.content.slice(0, 8000),
            }))
            .slice(0, 6),
        };
      else if (url.pathname === "/api/ai/grounded")
        return route.fulfill({
          contentType: "text/event-stream",
          headers: { "access-control-allow-origin": "*" },
          body:
            "data: " +
            JSON.stringify({
              chunk:
                "先写清单，再安排执行时间，有助于回顾自己的完成情况[1]。\n\n第一步，列出真实需要完成的事情。\n第二步，为重要事项预留时间。\n最后，记录结果，调整下一次安排。",
            }) +
            "\n\ndata: [DONE]\n\n",
        });
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
        } else if (method === "DELETE") {
          drafts.delete(id);
          for (const post of posts)
            if (post.draft_id === id) post.draft_id = null;
          data = { ok: true };
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
        const draft = drafts.get(body.draft_id);
        if (body.expected_version && draft?.version !== body.expected_version)
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ detail: "草稿版本冲突" }),
          });
        const item = {
          ...body,
          id: "post-" + posts.length,
          published_at: body.published_at || new Date().toISOString(),
          draft_version: draft?.version,
          topic_tags: draft?.topic_tags ?? [],
          image_ids: draft?.image_ids ?? [],
        };
        posts.push(item);
        if (draft) {
          draft.status = "published";
          draft.version = Number(draft.version) + 1;
        }
        data = item;
      } else if (
        /^\/api\/analytics\/posts\/[^/]+$/.test(url.pathname) &&
        method === "POST"
      ) {
        const postId = url.pathname.split("/").pop()!;
        const item = {
          ...body,
          collected_at: body.collected_at ?? new Date().toISOString(),
        };
        metrics.set(postId, [item, ...(metrics.get(postId) ?? [])]);
        data = item;
      } else if (url.pathname === "/api/analytics/posts")
        data = {
          posts: posts.map((post) => ({
            post_id: post.id,
            xhs_post_url: post.xhs_post_url,
            published_at: post.published_at,
            history: metrics.get(String(post.id)) ?? [],
            latest: metrics.get(String(post.id))?.[0] ?? null,
          })),
        };
      else if (url.pathname === "/api/analytics/import") {
        const lines = String(body.csv_text).trim().split("\n");
        const header = lines.shift()!.split(",");
        const rows = lines.map((line, i) => {
          const entry = Object.fromEntries(
            line.split(",").map((value, index) => [header[index], value]),
          );
          const post = posts.find(
            (p) =>
              p.xhs_post_url === entry.xhs_post_url || p.id === entry.post_id,
          )!;
          return {
            ...entry,
            row: i + 2,
            post_id: post.id,
            xhs_post_url: post.xhs_post_url,
            view_count: Number(entry.view_count),
            like_count: Number(entry.like_count),
            comment_count: Number(entry.comment_count),
            share_count: Number(entry.share_count),
            collect_count: Number(entry.collect_count),
          };
        });
        if (body.confirm)
          for (const row of rows)
            metrics.set(String(row.post_id), [
              row,
              ...(metrics.get(String(row.post_id)) ?? []),
            ]);
        data = {
          rows,
          errors: [],
          imported: body.confirm ? rows.length : 0,
          skipped: 0,
        };
      } else if (url.pathname === "/api/analytics/insights")
        data = {
          window_hours: 24,
          window_tolerance_hours: 3,
          groups: posts.length
            ? [
                {
                  kind: "topic",
                  name: "效率",
                  sample_count: 1,
                  total_posts: 1,
                  missing_count: 0,
                  average_views: 120,
                  average_interactions: 12,
                  interaction_rate: 0.1,
                  post_ids: [posts[0].id],
                  observation_ages_hours: [24],
                },
              ]
            : [],
        };
      else if (url.pathname === "/api/analytics/review")
        data = {
          observations: ["效率主题有一篇记录，仍需更多样本。"],
          ideas: posts.length
            ? [
                {
                  title: "清单的进阶实践",
                  reason: "根据24小时观察继续尝试，不代表因果结论。",
                  post_ids: [posts[0].id],
                },
              ]
            : [],
          limitations: ["样本不足，仅供下一步尝试。"],
        };
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
