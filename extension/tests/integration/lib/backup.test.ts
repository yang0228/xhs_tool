import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sealBackup,
  openBackup,
  restoreBackup,
} from "../../../src/sidepanel/lib/backup";
import { chrome, resetChromeMocks } from "../../mocks/chrome";

const payload = () => ({
  version: 1 as const,
  backendUrl: "http://localhost:8000/api",
  userId: "owner",
  createdAt: new Date().toISOString(),
  masterKey: {
    keyBase64: btoa("a".repeat(32)),
    saltBase64: btoa("s".repeat(32)),
  },
  recovery: {},
  records: {
    version: 1,
    user_id: "owner",
    materials: [],
    drafts: [],
    images: [],
    published_posts: [],
    post_analytics: [],
  },
});
describe("password protected backup", () => {
  beforeEach(() => {
    resetChromeMocks();
    vi.restoreAllMocks();
  });
  it("roundtrips keys and records with a fresh salt and IV", async () => {
    const data = payload();
    const a = await sealBackup(data, "long-password");
    const b = await sealBackup(data, "long-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain(data.masterKey.keyBase64);
    expect(await openBackup(a, "long-password")).toEqual(data);
  });
  it("rejects wrong password, corruption, malformed payload and short password", async () => {
    const a = await sealBackup(payload(), "long-password");
    await expect(openBackup(a, "wrong-password")).rejects.toThrow();
    await expect(
      openBackup({ ...a, ciphertext: a.ciphertext.slice(4) }, "long-password"),
    ).rejects.toThrow();
    await expect(
      openBackup({ ...a, iterations: 1 }, "long-password"),
    ).rejects.toThrow();
    await expect(
      sealBackup({ ...payload(), masterKey: {} } as never, "long-password"),
    ).rejects.toThrow();
    await expect(sealBackup(payload(), "short")).rejects.toThrow();
  });
  it("refuses unrelated master key before backend mutation", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: payload().backendUrl, apiKey: "key" },
      xhs_master_key: {
        keyBase64: btoa("b".repeat(32)),
        saltBase64: btoa("s".repeat(32)),
      },
    });
    const request = vi.fn();
    await expect(restoreBackup(payload(), "owner", request)).rejects.toThrow(
      /密钥/,
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves local key if backend restore fails", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: payload().backendUrl, apiKey: "key" },
      xhs_master_key: payload().masterKey,
    });
    const before = await chrome.storage.local.get(null);
    await expect(
      restoreBackup(
        payload(),
        "owner",
        vi.fn().mockRejectedValue(new Error("offline")),
      ),
    ).rejects.toThrow("offline");
    expect(await chrome.storage.local.get(null)).toEqual(before);
  });
  it("refuses account mismatch without writing server or storage", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: payload().backendUrl, apiKey: "key" },
    });
    const request = vi.fn();
    const before = await chrome.storage.local.get(null);
    await expect(
      restoreBackup(payload(), "someone-else", request),
    ).rejects.toThrow(/账号/);
    expect(request).not.toHaveBeenCalled();
    expect(await chrome.storage.local.get(null)).toEqual(before);
  });
  it("does not send the master key or recovery data to the backend", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: payload().backendUrl, apiKey: "key" },
    });
    const request = vi.fn().mockResolvedValue({});
    await restoreBackup(payload(), "owner", request);
    expect(request).toHaveBeenCalledWith("/backup/restore", payload().records);
    expect(
      (await chrome.storage.local.get("xhs_master_key"))?.xhs_master_key,
    ).toEqual(payload().masterKey);
  });
  it("preserves edits created while the server import is pending", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: payload().backendUrl, apiKey: "key" },
      xhs_master_key: payload().masterKey,
    });
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([payload().backendUrl, "key"])),
    );
    const prefix =
      "xhs_recovery:" +
      Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("") +
      ":";
    const entry = {
      ciphertext: btoa("c".repeat(16)),
      iv: btoa("i".repeat(12)),
      salt: btoa("s".repeat(32)),
    };
    const newer = { ...entry, ciphertext: btoa("n".repeat(16)) };
    await restoreBackup(
      { ...payload(), recovery: { draft: entry } },
      "owner",
      async () => {
        await chrome.storage.local.set({ [prefix + "draft"]: newer });
      },
    );
    expect(
      (await chrome.storage.local.get(prefix + "draft"))?.[prefix + "draft"],
    ).toEqual(newer);
  });
});
