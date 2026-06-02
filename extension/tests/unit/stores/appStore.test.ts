import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "../../../src/sidepanel/stores/appStore";

describe("appStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with empty toasts", () => {
    expect(useAppStore.getState().toasts).toEqual([]);
  });

  it("addToast appends a toast with id, message, and type", () => {
    useAppStore.getState().addToast("Test message", "success");
    const { toasts } = useAppStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Test message");
    expect(toasts[0].type).toBe("success");
    expect(toasts[0].id).toBeDefined();
    expect(typeof toasts[0].id).toBe("string");
  });

  it("addToast supports error and info types", () => {
    useAppStore.getState().addToast("err", "error");
    expect(useAppStore.getState().toasts[0].type).toBe("error");

    useAppStore.getState().addToast("info", "info");
    expect(useAppStore.getState().toasts[1].type).toBe("info");
  });

  it("addToast auto-removes toast after 3 seconds", () => {
    useAppStore.getState().addToast("ephemeral", "success");
    expect(useAppStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(useAppStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it("removeToast removes specific toast by id", () => {
    useAppStore.getState().addToast("first", "success");
    useAppStore.getState().addToast("second", "error");
    const { toasts } = useAppStore.getState();
    const firstId = toasts[0].id;

    useAppStore.getState().removeToast(firstId);
    const remaining = useAppStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe("second");
  });

  it("removeToast does nothing for unknown id", () => {
    useAppStore.getState().addToast("only", "success");
    useAppStore.getState().removeToast("nonexistent");
    expect(useAppStore.getState().toasts).toHaveLength(1);
  });

  it("multiple toasts all auto-remove after their respective timeouts", () => {
    useAppStore.getState().addToast("a", "success");
    vi.advanceTimersByTime(1000);
    useAppStore.getState().addToast("b", "error");

    // After 3000ms from first toast, only "a" should be removed
    vi.advanceTimersByTime(2000);
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].message).toBe("b");
  });
});
