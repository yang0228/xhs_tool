import { beforeEach, expect, it, vi } from "vitest";
import { chrome, resetChromeMocks } from "../../mocks/chrome";
import {
  encodeDraft,
  decodeDraft,
  saveRecovery,
  loadRecovery,
  clearRecovery,
} from "../../../src/sidepanel/lib/drafts";
import {
  readSettings,
  saveSettings,
} from "../../../src/sidepanel/lib/settings";
import type { Draft } from "../../../src/shared/types";

beforeEach(() => resetChromeMocks());
it("keeps model and previous settings during partial updates", async () => {
  await chrome.storage.local.set({
    settings: { aiModel: "custom", apiKey: "original" },
  });
  await saveSettings({ backendUrl: "https://example.com/api/" });
  expect(await readSettings()).toEqual({
    aiModel: "custom",
    apiKey: "original",
    backendUrl: "https://example.com/api",
  });
});
it("concurrent settings patches do not overwrite each other", async () => {
  await Promise.all([
    saveSettings({ aiModel: "model" }),
    saveSettings({ apiKey: "key" }),
  ]);
  expect(await readSettings()).toMatchObject({
    aiModel: "model",
    apiKey: "key",
  });
});
it("reopens a draft with independent title and body IVs", async () => {
  const input = {
    title: "标题",
    content: "长文🌟".repeat(100),
    image_ids: ["one", "two"],
  };
  const encoded = await encodeDraft(input);
  expect(encoded.encryption_iv).not.toBe(encoded.content_iv);
  expect(encoded.encryption_version).toBe(2);
  expect(await decodeDraft(encoded as Draft)).toEqual(input);
});
it("fails explicitly when a legacy draft has lost its body IV", async () => {
  const encoded = await encodeDraft({
    title: "title",
    content: "body",
    image_ids: [],
  });
  await expect(
    decodeDraft({
      ...encoded,
      content_iv: null,
      encryption_version: 1,
    } as Draft),
  ).rejects.toThrow(/恢复|recover/i);
});
it("stores only ciphertext and scopes recovery to connection identity", async () => {
  const input = {
    title: "private title",
    content: "private body",
    image_ids: ["image"],
    id: "draft",
    version: 3,
  };
  await saveRecovery("draft", input);
  expect(JSON.stringify(await chrome.storage.local.get(null))).not.toContain(
    "private",
  );
  expect(await loadRecovery("draft")).toEqual(input);
  await saveSettings({ apiKey: "different account" });
  expect(await loadRecovery("draft")).toBeNull();
  await saveSettings({ apiKey: "" });
  expect(await loadRecovery("draft")).toEqual(input);
  await clearRecovery("draft");
  expect(await loadRecovery("draft")).toBeNull();
});
it("encodes one document snapshot even if the editor changes during encryption", async () => {
  const doc = {
    title: "before",
    content: "before body",
    image_ids: ["before-image"],
  };
  const pending = encodeDraft(doc);
  doc.content = "after body";
  doc.image_ids.push("after-image");
  expect(await decodeDraft((await pending) as Draft)).toEqual({
    title: "before",
    content: "before body",
    image_ids: ["before-image"],
  });
});
it("snapshots recovery input and never resurrects a recovery after clear", async () => {
  const doc = { title: "before", content: "before body", image_ids: [] };
  const saving = saveRecovery("draft", doc);
  doc.content = "after";
  await saving;
  expect(await loadRecovery("draft")).toMatchObject({ content: "before body" });
  await Promise.all([saveRecovery("draft", doc), clearRecovery("draft")]);
  expect(await loadRecovery("draft")).toBeNull();
});
it("rejects pending recovery operations when the account changes", async () => {
  const saving = saveRecovery("draft", {
    title: "secret",
    content: "secret",
    image_ids: [],
  });
  const rejected = expect(saving).rejects.toThrow(/切换/);
  await chrome.storage.local.set({ settings: { apiKey: "new account" } });
  await rejected;
  expect(await loadRecovery("draft")).toBeNull();
});
it("reads recoverable legacy ciphertext without silently upgrading it", async () => {
  const encoded = await encodeDraft({
    title: "legacy value",
    content: "unused",
    image_ids: [],
  });
  const legacy = {
    ...encoded,
    encrypted_content: encoded.encrypted_title,
    content_iv: null,
    encryption_version: 1,
  } as Draft;
  expect(await decodeDraft(legacy)).toEqual({
    title: "legacy value",
    content: "legacy value",
    image_ids: [],
  });
  expect(legacy.encryption_version).toBe(1);
});
it("waits for a cross-window backup recovery lock before writing", async () => {
  const { recoveryScope } = await import("../../../src/sidepanel/lib/drafts");
  const scope = await recoveryScope();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (name: string, operation: () => unknown) => {
        if (name === `xhs-recovery:${scope}`) await held;
        return operation();
      },
    },
  });
  let completed = false;
  const pending = saveRecovery("locked", {
    title: "title",
    content: "body",
    image_ids: [],
  }).then(() => {
    completed = true;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(completed).toBe(false);
  } finally {
    release();
    await pending;
    vi.unstubAllGlobals();
  }
  expect(await loadRecovery("locked")).toMatchObject({
    title: "title",
    content: "body",
  });
});
it("rejects recovery writes whose originating account was replaced before dispatch", async () => {
  const { recoveryScope } = await import("../../../src/sidepanel/lib/drafts");
  const origin = await recoveryScope();
  await saveSettings({ apiKey: "different-owner" });
  await expect(
    saveRecovery(
      "draft",
      { title: "private", content: "private body", image_ids: [] },
      origin,
    ),
  ).rejects.toThrow(/切换/);
  expect(await loadRecovery("draft")).toBeNull();
});
