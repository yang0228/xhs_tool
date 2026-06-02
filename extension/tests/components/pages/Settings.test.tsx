import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Settings from "../../../src/sidepanel/pages/Settings";
import { resetChromeMocks, chrome } from "../../mocks/chrome";

describe("Settings Page", () => {
  beforeEach(() => { resetChromeMocks(); });

  it("renders title and inputs", () => {
    render(<Settings />);
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("后端地址")).toBeInTheDocument();
    expect(screen.getByText("API Key")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<Settings />);
    expect(screen.getByText("注册新 Key")).toBeInTheDocument();
    expect(screen.getByText("保存设置")).toBeInTheDocument();
  });

  it("renders about section", () => {
    render(<Settings />);
    expect(screen.getByText("关于")).toBeInTheDocument();
    expect(screen.getByText("XHS Tool v0.1.0")).toBeInTheDocument();
  });

  it("loads settings from chrome.storage on mount", () => {
    chrome.storage.local.set({ settings: { backendUrl: "https://custom.api", apiKey: "my-key" } });
    render(<Settings />);
    expect(screen.getByDisplayValue("https://custom.api")).toBeInTheDocument();
  });
});
