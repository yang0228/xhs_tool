import type { Draft, EncryptedPayload } from "../../shared/types";
import { encryptContent, decryptContent, hashContent } from "./crypto";
import { readSettings } from "./settings";

export interface DraftDocument {
  title: string;
  content: string;
  image_ids: string[];
}
type RecoveryDocument = DraftDocument & { id?: string; version?: number };

export async function encodeDraft(doc: DraftDocument) {
  doc = { ...doc, image_ids: [...doc.image_ids] };
  const title = await encryptContent(doc.title);
  const content = await encryptContent(doc.content);
  return {
    encrypted_title: title.ciphertext,
    encrypted_content: content.ciphertext,
    encryption_iv: title.iv,
    encryption_salt: title.salt,
    content_iv: content.iv,
    encryption_version: 2 as const,
    title_hash: await hashContent(doc.title),
    image_ids: [...doc.image_ids],
  };
}

export async function decodeDraft(draft: Draft): Promise<DraftDocument> {
  try {
    if ((draft.encryption_version ?? 1) >= 2 && !draft.content_iv)
      throw new Error("正文 IV 缺失");
    const title = await decryptContent({
      ciphertext: draft.encrypted_title,
      iv: draft.encryption_iv,
      salt: draft.encryption_salt,
    });
    const content = await decryptContent({
      ciphertext: draft.encrypted_content,
      iv: draft.content_iv || draft.encryption_iv,
      salt: draft.encryption_salt,
    });
    return { title, content, image_ids: draft.image_ids ?? [] };
  } catch (error) {
    throw new Error(
      `草稿恢复失败，请恢复原始密钥或完整备份；原始密文已保留。${error instanceof Error ? error.message : ""}`,
    );
  }
}

export async function recoveryScope(identity?: {
  backendUrl: string;
  apiKey: string;
}): Promise<string> {
  const settings = identity ?? (await readSettings());
  return hashContent(JSON.stringify([settings.backendUrl, settings.apiKey]));
}
async function checkScope(scope: string) {
  if ((await recoveryScope()) !== scope)
    throw new Error("账户或后端已切换，请重新打开草稿。");
}

// Serializing operations prevents an older save from resurrecting a cleared recovery.
let recoveryPending: Promise<unknown> = Promise.resolve();
function recoveryOperation<T>(
  operation: (scope: string) => Promise<T>,
  expectedScope?: string,
): Promise<T> {
  const capturedScope = recoveryScope();
  const result = recoveryPending.then(async () => {
    const scope = await capturedScope;
    if (expectedScope !== undefined && scope !== expectedScope)
      throw new Error("账户或后端已切换，请重新打开草稿。");
    const run = async () => {
      await checkScope(scope);
      return operation(scope);
    };
    return navigator.locks
      ? await navigator.locks.request(`xhs-recovery:${scope}`, run)
      : run();
  });
  recoveryPending = result.catch(() => {});
  return result;
}
export function saveRecovery(
  key: string,
  doc: RecoveryDocument,
  expectedScope?: string,
): Promise<void> {
  const snapshot = JSON.stringify(doc);
  return recoveryOperation(async (scope) => {
    const encrypted = await encryptContent(snapshot);
    await checkScope(scope);
    await chrome.storage.local.set({
      [`xhs_recovery:${scope}:${key}`]: encrypted,
    });
  }, expectedScope);
}
export function loadRecovery(
  key: string,
  expectedScope?: string,
): Promise<RecoveryDocument | null> {
  return recoveryOperation(async (scope) => {
    const storageKey = `xhs_recovery:${scope}:${key}`;
    const stored =
      await chrome.storage.local.get<Record<string, EncryptedPayload | null>>(
        storageKey,
      );
    const encrypted = stored[storageKey];
    const result = encrypted
      ? (JSON.parse(await decryptContent(encrypted)) as RecoveryDocument)
      : null;
    await checkScope(scope);
    return result;
  }, expectedScope);
}
export function clearRecovery(
  key: string,
  expectedScope?: string,
): Promise<void> {
  return recoveryOperation(async (scope) => {
    await checkScope(scope);
    // A null tombstone also makes older exported snapshots easy to distinguish from pending edits.
    await chrome.storage.local.set({ [`xhs_recovery:${scope}:${key}`]: null });
  }, expectedScope);
}
