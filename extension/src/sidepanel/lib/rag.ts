import type { Material } from "../../shared/types";
import { apiPost, type ApiIdentity } from "./api";
import { readMaterial } from "./materials";
import { recoveryScope } from "./drafts";

export async function readRagConsent(identity?: ApiIdentity) {
  const key = "xhs_rag_enabled:" + (await recoveryScope(identity));
  return (
    (await chrome.storage.local.get<Record<string, boolean>>(key))[key] === true
  );
}
export async function saveRagConsent(enabled: boolean, identity?: ApiIdentity) {
  const key = "xhs_rag_enabled:" + (await recoveryScope(identity));
  await chrome.storage.local.set({ [key]: enabled });
}
export async function syncMaterial(
  material: Material,
  identity: ApiIdentity,
  signal?: AbortSignal,
) {
  if (!(await readRagConsent(identity)))
    throw new Error("请先在设置中允许 RAG 使用所选素材的明文副本");
  const decoded = await readMaterial(material);
  if (decoded.unreadable) throw new Error("素材无法解密，请恢复密钥后重试");
  return apiPost<{ status: string; last_error?: string }>(
    "/materials/" + material.id + "/rag",
    {
      title: decoded.title,
      content: decoded.content,
      content_hash: material.content_hash,
    },
    signal,
    identity,
  );
}
