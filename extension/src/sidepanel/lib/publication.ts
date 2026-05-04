import type { PublishedPost } from "../../shared/types";
import { apiGet, type ApiIdentity } from "./api";
import type { Draft } from "../../shared/types";
import { decryptContent, encryptContent } from "./crypto";
import { parseContext } from "./creator";
import type { DraftDocument } from "./drafts";
import { cardSourceSignature } from "./cards";

export async function validatePublication(doc: DraftDocument) {
  if (!doc.title.trim() || !doc.content.trim())
    throw new Error("请填写标题和正文后再准备发布");
  const cards = doc.context?.cards;
  if (cards) {
    if (!cards.pages.length) throw new Error("请至少保留一张图文卡片");
    if (
      cards.pages.some((p) => p.image_id && !doc.image_ids.includes(p.image_id))
    )
      throw new Error("卡片引用了未选择的配图，请返回编辑重新选择或移除");
    if (
      cards.source_signature !==
      (await cardSourceSignature(doc.title, doc.content))
    )
      throw new Error("标题或正文已变化，请返回图文工作台核对卡片后保存");
  }
}
export async function checkSavedVersion(
  id: string,
  version: number,
  identity?: ApiIdentity,
) {
  const current = await apiGet<Draft>("/drafts/" + id, undefined, identity);
  if (current.version !== version)
    throw new Error("草稿已有新版本，当前发布包或预览已过期，请重新加载草稿");
}
export function encodePublicationSnapshot(doc: DraftDocument, version: number) {
  return encryptContent(JSON.stringify({ format: 1, version, document: doc }));
}
export async function decodePublicationSnapshot(
  post: PublishedPost,
): Promise<DraftDocument> {
  if (!post.snapshot) throw new Error("这条旧发布记录没有保存内容快照");
  const value = JSON.parse(await decryptContent(post.snapshot));
  const doc = value.document as DraftDocument;
  if (
    value.format !== 1 ||
    !doc ||
    typeof doc.title !== "string" ||
    typeof doc.content !== "string" ||
    !Array.isArray(doc.image_ids) ||
    doc.image_ids.some((id) => typeof id !== "string")
  )
    throw new Error("发布快照格式无效，原始密文已保留");
  if (doc.context) parseContext(doc.context);
  // A restore may deduplicate image rows. Resolve against the publication's
  // ordered, owner-validated IDs without rewriting historical ciphertext.
  if (post.image_ids && post.image_ids.length === doc.image_ids.length) {
    const mapping = new Map(
      doc.image_ids.map((id, index) => [id, post.image_ids![index]]),
    );
    if (doc.context?.cards)
      doc.context.cards.pages = doc.context.cards.pages.map((page) => ({
        ...page,
        ...(page.image_id
          ? { image_id: mapping.get(page.image_id) ?? page.image_id }
          : {}),
      }));
    doc.image_ids = [...post.image_ids];
  }
  return doc;
}
export function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
