import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEncryption } from "../../../src/sidepanel/hooks/useEncryption";

vi.mock("../../../src/sidepanel/lib/crypto", () => ({
  getOrCreateMasterKey: vi.fn(),
  encryptContent: vi.fn(),
  decryptContent: vi.fn(),
  hashContent: vi.fn(),
}));

import * as cryptoMod from "../../../src/sidepanel/lib/crypto";

describe("useEncryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with ready=false", () => {
    (cryptoMod.getOrCreateMasterKey as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEncryption());
    expect(result.current.ready).toBe(false);
  });

  it("sets ready=true after master key initializes", async () => {
    (cryptoMod.getOrCreateMasterKey as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { result } = renderHook(() => useEncryption());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(true);
  });

  it("encrypt calls encryptContent", async () => {
    (cryptoMod.getOrCreateMasterKey as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (cryptoMod.encryptContent as ReturnType<typeof vi.fn>).mockResolvedValue({ ciphertext: "enc", iv: "iv", salt: "s" });
    const { result } = renderHook(() => useEncryption());
    let r: unknown;
    await act(async () => { r = await result.current.encrypt("hello"); });
    expect(r).toEqual({ ciphertext: "enc", iv: "iv", salt: "s" });
  });

  it("decrypt calls decryptContent", async () => {
    (cryptoMod.getOrCreateMasterKey as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (cryptoMod.decryptContent as ReturnType<typeof vi.fn>).mockResolvedValue("plaintext");
    const { result } = renderHook(() => useEncryption());
    let r: unknown;
    await act(async () => { r = await result.current.decrypt({ ciphertext: "e", iv: "i", salt: "s" }); });
    expect(r).toBe("plaintext");
  });

  it("hash calls hashContent", async () => {
    (cryptoMod.getOrCreateMasterKey as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (cryptoMod.hashContent as ReturnType<typeof vi.fn>).mockResolvedValue("abc123");
    const { result } = renderHook(() => useEncryption());
    let r: unknown;
    await act(async () => { r = await result.current.hash("data"); });
    expect(r).toBe("abc123");
  });
});
