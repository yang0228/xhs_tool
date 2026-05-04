import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetChromeMocks } from "../../mocks/chrome";
import {
  decodeDraft,
  encodeDraft,
  saveRecovery,
  loadRecovery,
} from "../../../src/sidepanel/lib/drafts";
import {
  openBackup,
  restoreBackup,
  sealBackup,
} from "../../../src/sidepanel/lib/backup";
import {
  pendingRestoreRepairCount,
  retryRestoreRepairs,
} from "../../../src/sidepanel/lib/backupRepair";
import type { Draft } from "../../../src/shared/types";
import { apiGet } from "../../../src/sidepanel/lib/api";
import {
  decodePublicationSnapshot,
  encodePublicationSnapshot,
} from "../../../src/sidepanel/lib/publication";
import { emptyContext } from "../../../src/sidepanel/lib/creator";
import type { PublishedPost } from "../../../src/shared/types";

beforeEach(() => resetChromeMocks());
afterEach(() => vi.unstubAllGlobals());

it("resolves restored publication images without rewriting its encrypted snapshot", async () => {
  const doc = {
    title: "历史内容",
    content: "正文",
    image_ids: ["old-image"],
    context: {
      ...emptyContext(),
      cards: {
        template: "steps" as const,
        palette: "rose" as const,
        source_signature: "hash",
        pages: [{ title: "封面", body: "", image_id: "old-image" }],
      },
    },
  };
  const snapshot = await encodePublicationSnapshot(doc, 1);
  const restored = await decodePublicationSnapshot({
    snapshot,
    image_ids: ["deduplicated-image"],
  } as PublishedPost);
  expect(restored.image_ids).toEqual(["deduplicated-image"]);
  expect(restored.context?.cards?.pages[0].image_id).toBe("deduplicated-image");
  expect(doc.image_ids).toEqual(["old-image"]);
});

it("rejects an old account response arriving after settings change", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await chrome.storage.local.set({
        settings: {
          backendUrl: "http://localhost:8000/api",
          apiKey: "different",
        },
      });
      return Response.json({ private: "old account" });
    }),
  );
  await expect(apiGet("/profile")).rejects.toThrow(/切换/);
});

it("encrypts brief and citations independently and preserves metadata in recovery", async () => {
  const doc = {
    title: "题目",
    content: "",
    image_ids: [],
    status: "idea" as const,
    planned_date: "2026-10-20",
    topic_tags: ["生活"],
    context: {
      format: 1 as const,
      brief: {
        goal: "介绍经验",
        audience: "新手",
        angle: "真实体验",
        evidence: "自有资料",
        cta: "收藏",
      },
      references: [],
    },
  };
  const encoded = await encodeDraft(doc);
  expect(JSON.stringify(encoded)).not.toContain("真实体验");
  expect(encoded).toHaveProperty("encrypted_context");
  expect((encoded as any).encrypted_context.iv).not.toBe(encoded.encryption_iv);
  expect(await decodeDraft(encoded as Draft)).toEqual(doc);
  await saveRecovery("idea", doc);
  expect(await loadRecovery("idea")).toEqual(doc);
});

it("reads password backup payload v2 while keeping the v1 encryption envelope", async () => {
  const payload = {
    version: 2 as const,
    backendUrl: "http://localhost:8000/api",
    userId: "owner",
    createdAt: new Date().toISOString(),
    masterKey: {
      keyBase64: btoa("a".repeat(32)),
      saltBase64: btoa("s".repeat(32)),
    },
    recovery: {},
    records: {
      version: 2,
      user_id: "owner",
      profile: { encrypted_profile: null, version: 0 },
      materials: [],
      images: [],
      drafts: [],
      published_posts: [],
      post_analytics: [],
    },
  };
  const encrypted = await sealBackup(payload, "long-password");
  expect(encrypted.version).toBe(1);
  expect(await openBackup(encrypted, "long-password")).toEqual(payload);
});

it("retains encrypted references after interrupted restore repair and retries safely", async () => {
  await chrome.storage.local.set({
    settings: { backendUrl: "http://localhost:8000/api", apiKey: "key" },
  });
  const encoded = await encodeDraft({
    title: "备份选题",
    content: "正文",
    image_ids: [],
    context: {
      format: 1,
      brief: { goal: "", audience: "", angle: "", evidence: "", cta: "" },
      references: [
        {
          id: "chunk",
          material_id: "old",
          content_hash: "hash",
          title: "原始依据",
          content: "事实",
        },
      ],
    },
  });
  let record = { ...encoded, id: "draft", version: 1 } as Draft;
  const key = (await chrome.storage.local.get("xhs_master_key"))
    .xhs_master_key as { keyBase64: string; saltBase64: string };
  let offline = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        if (offline) throw new Error("offline");
        record = { ...record, ...JSON.parse(String(init.body)), version: 2 };
      }
      return Response.json(record);
    }),
  );
  const payload = {
    version: 2 as const,
    backendUrl: "http://localhost:8000/api",
    userId: "owner",
    createdAt: new Date().toISOString(),
    masterKey: key,
    recovery: {},
    records: {
      version: 2,
      user_id: "owner",
      materials: [],
      images: [],
      drafts: [record as unknown as Record<string, unknown>],
      published_posts: [],
      post_analytics: [],
    },
  };
  await expect(
    restoreBackup(payload, "owner", async () => ({
      id_map: {
        materials: { old: "new" },
        images: {},
        drafts: { draft: "draft" },
      },
    })),
  ).rejects.toThrow();
  expect(record.encrypted_context).toEqual(encoded.encrypted_context);
  expect(await pendingRestoreRepairCount()).toBe(1);
  offline = false;
  await retryRestoreRepairs();
  expect((await decodeDraft(record)).context?.references[0].material_id).toBe(
    "new",
  );
  expect(await pendingRestoreRepairCount()).toBe(0);
});
