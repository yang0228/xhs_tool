import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Settings from "../../../src/sidepanel/pages/Settings";
import { resetChromeMocks, chrome } from "../../mocks/chrome";

describe("Settings Page", () => {
  beforeEach(() => {
    resetChromeMocks();
    vi.restoreAllMocks();
  });
  it("loads saved settings and preserves additional preferences when saving", async () => {
    await chrome.storage.local.set({
      settings: {
        backendUrl: "https://custom.api",
        apiKey: "my-key",
        aiModel: "model",
      },
    });
    render(<Settings />);
    const input = await screen.findByDisplayValue("https://custom.api");
    fireEvent.change(input, { target: { value: "https://next.api/" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await screen.findByText("设置已保存");
    expect(
      (await chrome.storage.local.get("settings"))?.settings,
    ).toMatchObject({ backendUrl: "https://next.api", aiModel: "model" });
  });
  it("rejects invalid URL without saving", async () => {
    render(<Settings />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存设置" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("后端地址"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await screen.findByRole("alert");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
  it("reports invalid registration response and never saves undefined API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ detail: "error" }),
        }),
    );
    render(<Settings />);
    const register = screen.getByRole("button", { name: "初始化新账号" });
    await waitFor(() => expect(register).toBeEnabled());
    fireEvent.click(register);
    await screen.findByRole("alert");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
  it("does not offer registration over an existing key", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: "https://custom.api", apiKey: "my-key" },
    });
    render(<Settings />);
    await screen.findByDisplayValue("my-key");
    expect(screen.getByRole("button", { name: "初始化新账号" })).toBeDisabled();
  });
  it("verifies health and identity separately", async () => {
    await chrome.storage.local.set({
      settings: { backendUrl: "https://custom.api", apiKey: "my-key" },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "invalid" }),
      });
    vi.stubGlobal("fetch", fetcher);
    render(<Settings />);
    await screen.findByDisplayValue("my-key");
    fireEvent.click(screen.getByRole("button", { name: "测试连接与身份" }));
    expect(
      await screen.findByText(/后端在线.*身份验证失败/),
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
