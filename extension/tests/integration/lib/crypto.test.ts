import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptContent,
  decryptContent,
  hashContent,
  getOrCreateMasterKey,
} from "../../../src/sidepanel/lib/crypto";
import { resetChromeMocks } from "../../mocks/chrome";

describe("crypto", () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe("getOrCreateMasterKey", () => {
    it("generates a new key and stores it when none exists", async () => {
      const { key, salt } = await getOrCreateMasterKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it("returns the same key on subsequent calls", async () => {
      const first = await getOrCreateMasterKey();
      const second = await getOrCreateMasterKey();
      expect(second.salt).toEqual(first.salt);
    });
  });

  describe("encryptContent and decryptContent", () => {
    it("roundtrips: encrypt then decrypt returns original text", async () => {
      const original = "Hello, XHS Tool! 这是一条测试消息。";
      const encrypted = await encryptContent(original);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.ciphertext.length).toBeGreaterThan(0);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();

      const decrypted = await decryptContent(encrypted);
      expect(decrypted).toBe(original);
    });

    it("produces different ciphertext for different plaintext", async () => {
      const a = await encryptContent("message A");
      const b = await encryptContent("message B");
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("produces different ciphertext for same plaintext (random IV)", async () => {
      const a = await encryptContent("same text");
      const b = await encryptContent("same text");
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("handles empty string", async () => {
      const encrypted = await encryptContent("");
      const decrypted = await decryptContent(encrypted);
      expect(decrypted).toBe("");
    });

    it("handles long text", async () => {
      const original = "A".repeat(10000);
      const encrypted = await encryptContent(original);
      const decrypted = await decryptContent(encrypted);
      expect(decrypted).toBe(original);
    });

    it("handles Unicode and emoji", async () => {
      const original = "🎉 小红书 📕 你好世界 🌍";
      const encrypted = await encryptContent(original);
      const decrypted = await decryptContent(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe("hashContent", () => {
    it("returns 64-char hex string", async () => {
      const hash = await hashContent("hello");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic", async () => {
      const a = await hashContent("same input");
      const b = await hashContent("same input");
      expect(a).toBe(b);
    });

    it("produces different hashes for different inputs", async () => {
      const a = await hashContent("input A");
      const b = await hashContent("input B");
      expect(a).not.toBe(b);
    });
  });
});

describe("key preservation", () => {
  beforeEach(() => resetChromeMocks());
  it("does not replace a missing key while trying to decrypt old data", async () => {
    const encrypted = await encryptContent("irreplaceable");
    resetChromeMocks();
    await expect(decryptContent(encrypted)).rejects.toThrow(/key|密钥/i);
    const { chrome } = await import("../../mocks/chrome");
    expect(await chrome.storage.local.get("xhs_master_key")).toEqual({});
  });
  it("simultaneous first encryptions remain decryptable after initialization", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => encryptContent(`text ${i}`)),
    );
    await expect(Promise.all(results.map(decryptContent))).resolves.toEqual(
      Array.from({ length: 12 }, (_, i) => `text ${i}`),
    );
  });
});
