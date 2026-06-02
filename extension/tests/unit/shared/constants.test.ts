import { describe, it, expect } from "vitest";
import {
  XHS_TITLE_MAX,
  XHS_CONTENT_MAX,
  XHS_MAX_IMAGES,
  DEFAULT_BACKEND_URL,
  POLL_INTERVAL_MS,
  AUTO_SAVE_DELAY_MS,
  CONTENT_TYPES,
  DRAFT_STATUSES,
  AI_OPERATIONS,
} from "../../../src/shared/constants";

describe("constants", () => {
  it("XHS_TITLE_MAX is 20", () => {
    expect(XHS_TITLE_MAX).toBe(20);
  });

  it("XHS_CONTENT_MAX is 1000", () => {
    expect(XHS_CONTENT_MAX).toBe(1000);
  });

  it("XHS_MAX_IMAGES is 18", () => {
    expect(XHS_MAX_IMAGES).toBe(18);
  });

  it("DEFAULT_BACKEND_URL is localhost:8000/api", () => {
    expect(DEFAULT_BACKEND_URL).toBe("http://localhost:8000/api");
  });

  it("POLL_INTERVAL_MS is 2000", () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
  });

  it("AUTO_SAVE_DELAY_MS is 2000", () => {
    expect(AUTO_SAVE_DELAY_MS).toBe(2000);
  });

  it("CONTENT_TYPES contains expected values", () => {
    expect(CONTENT_TYPES).toEqual(["article", "conversation", "link", "custom"]);
  });

  it("DRAFT_STATUSES contains expected values", () => {
    expect(DRAFT_STATUSES).toEqual(["draft", "ready", "published"]);
  });

  it("AI_OPERATIONS has expected keys", () => {
    expect(AI_OPERATIONS.SUMMARIZE).toBe("summarize");
    expect(AI_OPERATIONS.GENERATE_TITLES).toBe("generate-titles");
    expect(AI_OPERATIONS.REWRITE).toBe("rewrite");
    expect(AI_OPERATIONS.POLISH).toBe("polish");
    expect(AI_OPERATIONS.OUTLINE).toBe("outline");
  });
});
