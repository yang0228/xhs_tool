import { MAX_CARD_PAGES, type CardDesign } from "./cards";

export interface CreatorProfile {
  position: string;
  audience: string;
  tone: string;
  avoid: string;
  examples: string[];
}
export interface Brief {
  goal: string;
  audience: string;
  angle: string;
  evidence: string;
  cta: string;
}
export interface SourceReference {
  id: string;
  material_id: string;
  content_hash: string;
  title: string;
  url?: string | null;
  content: string;
  verified?: boolean;
  availability?: "active" | "changed" | "missing";
}
export interface DraftContext {
  format: 1;
  brief: Brief;
  profile?: CreatorProfile;
  references: SourceReference[];
  cards?: CardDesign;
}
export const emptyProfile = (): CreatorProfile => ({
  position: "",
  audience: "",
  tone: "",
  avoid: "",
  examples: [],
});
export const emptyContext = (): DraftContext => ({
  format: 1,
  brief: { goal: "", audience: "", angle: "", evidence: "", cta: "" },
  references: [],
});
export const draftStatuses = {
  idea: "选题",
  draft: "创作中",
  ready: "待发布",
  published: "已发布",
} as const;

export function parseProfile(value: unknown): CreatorProfile {
  const p = value as CreatorProfile;
  if (
    !p ||
    ["position", "audience", "tone", "avoid"].some(
      (k) =>
        typeof p[k as keyof CreatorProfile] !== "string" ||
        (p[k as keyof CreatorProfile] as string).length > 1000,
    ) ||
    !Array.isArray(p.examples) ||
    p.examples.length > 3 ||
    p.examples.some((s) => typeof s !== "string" || s.length > 2000)
  )
    throw new Error("创作档案格式无效，请保留原数据并检查备份");
  return p;
}
export function parseContext(value: unknown): DraftContext {
  const c = value as DraftContext;
  if (
    !c ||
    c.format !== 1 ||
    !c.brief ||
    ["goal", "audience", "angle", "evidence", "cta"].some(
      (k) =>
        typeof c.brief[k as keyof Brief] !== "string" ||
        c.brief[k as keyof Brief].length > 600,
    ) ||
    !Array.isArray(c.references) ||
    c.references.length > 100 ||
    c.references.some(
      (r) =>
        !r ||
        ["id", "material_id", "content_hash", "title", "content"].some(
          (k) => typeof r[k as keyof SourceReference] !== "string",
        ),
    )
  )
    throw new Error("创作上下文格式无效，请保留原数据并检查备份");
  if (c.profile) parseProfile(c.profile);
  if (
    c.cards &&
    (!["checklist", "steps"].includes(c.cards.template) ||
      !["rose", "ink", "sage"].includes(c.cards.palette) ||
      !Array.isArray(c.cards.pages) ||
      c.cards.pages.length > MAX_CARD_PAGES ||
      typeof c.cards.source_signature !== "string" ||
      c.cards.pages.some(
        (p) => typeof p.title !== "string" || typeof p.body !== "string",
      ))
  )
    throw new Error("图文参数格式无效，请保留原数据并检查备份");
  return c;
}
