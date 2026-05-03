import type { Draft, EncryptedPayload } from "../../shared/types";
import { apiGet, apiPut, type ApiIdentity } from "./api";
import { decodeDraft, encodeDraft, recoveryScope } from "./drafts";
import { readSettings } from "./settings";

type IdMap = Record<string, Record<string, string>>;
interface Repair {
  id: string;
  version: number;
  context: EncryptedPayload;
  materials: Record<string, string>;
  images: Record<string, string>;
}
interface Pending {
  tasks: Repair[];
}

export async function restoreRepairEntry(
  records: { drafts: Record<string, unknown>[] },
  response: unknown,
  identity: ApiIdentity,
) {
  const map = (response as { id_map?: IdMap } | undefined)?.id_map;
  if (
    !map ||
    !["materials", "images"].some((table) =>
      Object.entries(map[table] ?? {}).some(([a, b]) => a !== b),
    )
  )
    return null;
  const key = "xhs_restore_repair:" + (await recoveryScope(identity));
  const previous = (
    await chrome.storage.local.get<Record<string, Pending>>(key)
  )[key];
  const tasks = (previous?.tasks ?? []).slice();
  for (const row of records.drafts) {
    if (
      !row.encrypted_context ||
      typeof row.id !== "string" ||
      typeof row.version !== "number"
    )
      continue;
    const id = map.drafts?.[row.id] ?? row.id;
    if (!tasks.some((t) => t.id === id))
      tasks.push({
        id,
        version: row.version,
        context: row.encrypted_context as EncryptedPayload,
        materials: map.materials ?? {},
        images: map.images ?? {},
      });
  }
  return tasks.length ? { key, value: { tasks } } : null;
}

export async function pendingRestoreRepairCount() {
  const key = "xhs_restore_repair:" + (await recoveryScope());
  return (
    (await chrome.storage.local.get<Record<string, Pending>>(key))[key]?.tasks
      .length ?? 0
  );
}

export async function retryRestoreRepairs(): Promise<void> {
  const identity = await readSettings();
  const scope = await recoveryScope(identity),
    key = "xhs_restore_repair:" + scope;
  const pending = (
    await chrome.storage.local.get<Record<string, Pending>>(key)
  )[key];
  if (!pending?.tasks.length) return;
  for (const task of [...pending.tasks]) {
    const record = await apiGet<Draft>(
      "/drafts/" + task.id,
      undefined,
      identity,
    );
    const doc = await decodeDraft(record);
    if (doc.context) {
      const before = JSON.stringify(doc.context);
      doc.context.references = doc.context.references.map((r) => ({
        ...r,
        material_id: task.materials[r.material_id] ?? r.material_id,
      }));
      if (doc.context.cards)
        doc.context.cards.pages = doc.context.cards.pages.map((p) => ({
          ...p,
          ...(p.image_id
            ? { image_id: task.images[p.image_id] ?? p.image_id }
            : {}),
        }));
      if (JSON.stringify(doc.context) !== before) {
        if (
          record.encrypted_context?.ciphertext !== task.context.ciphertext ||
          record.version !== task.version
        )
          throw new Error(
            "服务器记录已恢复；引用修复遇到更新后的草稿，请先核对该草稿的来源，再重试恢复引用。原始密文已保留。",
          );
        await apiPut(
          "/drafts/" + task.id,
          { ...(await encodeDraft(doc)), expected_version: record.version },
          undefined,
          identity,
        );
      }
    }
    if ((await recoveryScope()) !== scope)
      throw new Error("恢复期间账号已切换，引用修复记录已保留");
    pending.tasks = pending.tasks.filter((t) => t.id !== task.id);
    await chrome.storage.local.set({
      [key]: pending.tasks.length ? pending : null,
    });
  }
}
