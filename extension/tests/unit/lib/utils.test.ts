import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  truncateText,
  formatDate,
  isValidXHSTitle,
  isValidXHSContent,
  debounce,
} from "../../../src/sidepanel/lib/utils";

describe("cn", () => {
  it("joins truthy class names with space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out false", () => {
    expect(cn("a", false, "b")).toBe("a b");
  });

  it("filters out undefined", () => {
    expect(cn("a", undefined, "b")).toBe("a b");
  });

  it("filters out null", () => {
    expect(cn("a", null, "b")).toBe("a b");
  });

  it("returns empty string for all falsy", () => {
    expect(cn(false, undefined, null)).toBe("");
  });

  it("handles single class", () => {
    expect(cn("only")).toBe("only");
  });
});

describe("truncateText", () => {
  it("returns text unchanged if shorter than maxLen", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("returns text unchanged if equal to maxLen", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis if longer than maxLen", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  it("works with maxLen 0", () => {
    expect(truncateText("hi", 0)).toBe("...");
  });
});

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2024-01-15T10:30:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a string containing month/day for a valid date", () => {
    const result = formatDate("2024-06-01T12:00:00Z");
    expect(result).toContain("6");
  });
});

describe("isValidXHSTitle", () => {
  it("returns false for empty string", () => {
    expect(isValidXHSTitle("")).toBe(false);
  });

  it("returns true for a short title", () => {
    expect(isValidXHSTitle("Hello")).toBe(true);
  });

  it("returns true for title at max length (20)", () => {
    expect(isValidXHSTitle("a".repeat(20))).toBe(true);
  });

  it("returns false for title exceeding max length", () => {
    expect(isValidXHSTitle("a".repeat(21))).toBe(false);
  });
});

describe("isValidXHSContent", () => {
  it("returns false for empty string", () => {
    expect(isValidXHSContent("")).toBe(false);
  });

  it("returns true for short content", () => {
    expect(isValidXHSContent("Hello world")).toBe(true);
  });

  it("returns true for content at max length (1000)", () => {
    expect(isValidXHSContent("a".repeat(1000))).toBe(true);
  });

  it("returns false for content exceeding max length", () => {
    expect(isValidXHSContent("a".repeat(1001))).toBe(false);
  });
});

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays function execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("only executes once for multiple rapid calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes arguments to the original function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("a", 1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("a", 1);
  });
});
