export const XHS_TITLE_MAX = 20;
export const XHS_CONTENT_MAX = 1000;
export const XHS_MAX_IMAGES = 18;

export const DEFAULT_BACKEND_URL = "http://localhost:8000/api";

export const POLL_INTERVAL_MS = 2000;
export const AUTO_SAVE_DELAY_MS = 2000;

export const CONTENT_TYPES = ["article", "conversation", "link", "custom"] as const;
export const DRAFT_STATUSES = ["draft", "ready", "published"] as const;

export const AI_OPERATIONS = {
  SUMMARIZE: "summarize",
  GENERATE_TITLES: "generate-titles",
  REWRITE: "rewrite",
  POLISH: "polish",
  OUTLINE: "outline",
} as const;
