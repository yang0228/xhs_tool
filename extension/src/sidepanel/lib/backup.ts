import { apiGet, apiPost } from "./api";
import { readSettings } from "./settings";
import type { EncryptedPayload } from "../../shared/types";

const ITERATIONS = 310_000;
const FORMAT = "xhs-tool-backup";
const tables = [
  "materials",
  "drafts",
  "images",
  "published_posts",
  "post_analytics",
] as const;
type Table = (typeof tables)[number];
export type BackupRecords = { version: number; user_id: string } & Record<
  Table,
  Record<string, unknown>[]
>;
export interface BackupPayload {
  version: 1;
  backendUrl: string;
  userId: string;
  createdAt: string;
  masterKey: { keyBase64: string; saltBase64: string };
  recovery: Record<string, EncryptedPayload>;
  records: BackupRecords;
}
export interface BackupEnvelope {
  format: string;
  version: number;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}
function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("备份格式无效");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function normalizeBackendUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("请输入有效的 HTTP/HTTPS 后端地址");
  return url.toString().replace(/\/+$/, "");
}
function validatePayload(value: unknown): asserts value is BackupPayload {
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.backendUrl !== "string" ||
    typeof value.userId !== "string" ||
    !value.userId ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error("备份内容格式无效");
  normalizeBackendUrl(value.backendUrl);
  if (
    !object(value.masterKey) ||
    typeof value.masterKey.keyBase64 !== "string" ||
    typeof value.masterKey.saltBase64 !== "string" ||
    decode(value.masterKey.keyBase64).length !== 32 ||
    decode(value.masterKey.saltBase64).length !== 32
  )
    throw new Error("备份密钥无效");
  if (
    !object(value.records) ||
    value.records.version !== 1 ||
    value.records.user_id !== value.userId ||
    tables.some(
      (table) =>
        !Array.isArray((value.records as Record<string, unknown>)[table]) ||
        !(value.records as Record<string, unknown[]>)[table].every(object),
    )
  )
    throw new Error("备份记录格式无效");
  if (!object(value.recovery)) throw new Error("恢复草稿格式无效");
  for (const [name, entry] of Object.entries(value.recovery)) {
    if (
      !name ||
      name.includes(":") ||
      !object(entry) ||
      typeof entry.ciphertext !== "string" ||
      decode(entry.ciphertext).length < 16 ||
      typeof entry.iv !== "string" ||
      decode(entry.iv).length !== 12 ||
      typeof entry.salt !== "string" ||
      decode(entry.salt).length !== 32
    )
      throw new Error("恢复草稿格式无效");
  }
}
async function passwordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (password.length < 10) throw new Error("备份密码至少需要 10 个字符");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealBackup(
  payload: BackupPayload,
  password: string,
): Promise<BackupEnvelope> {
  validatePayload(payload);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    format: FORMAT,
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
}
export async function openBackup(
  envelope: unknown,
  password: string,
): Promise<BackupPayload> {
  if (
    !object(envelope) ||
    envelope.format !== FORMAT ||
    envelope.version !== 1 ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== ITERATIONS ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  )
    throw new Error("不支持的备份格式");
  const salt = decode(envelope.salt),
    iv = decode(envelope.iv),
    ciphertext = decode(envelope.ciphertext);
  if (salt.length !== 32 || iv.length !== 12 || ciphertext.length < 16)
    throw new Error("备份文件已损坏");
  const key = await passwordKey(password, salt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext),
      ),
    );
  } catch {
    throw new Error("密码错误或备份文件已损坏");
  }
  validatePayload(parsed);
  return parsed;
}
async function recoveryPrefix(
  backendUrl: string,
  apiKey: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([backendUrl.trim().replace(/\/+$/, ""), apiKey]),
    ),
  );
  return `xhs_recovery:${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")}:`;
}
async function withLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(name, action) : action();
}
export async function collectBackup(): Promise<BackupPayload> {
  return withLock("xhs-settings", collectBackupUnlocked);
}
async function collectBackupUnlocked(): Promise<BackupPayload> {
  const settings = await readSettings();
  const identity = await apiPost<{ user_id: string }>("/auth/verify");
  const records = await apiGet<BackupRecords>("/backup");
  const storage = await chrome.storage.local.get(null);
  if (!storage.xhs_master_key)
    throw new Error("尚无本地加密密钥；请先创建内容，或恢复已有备份");
  const prefix = await recoveryPrefix(settings.backendUrl, settings.apiKey);
  const recovery = Object.fromEntries(
    Object.entries(storage)
      .filter(([key, entry]) => key.startsWith(prefix) && entry != null)
      .map(([key, entry]) => [key.slice(prefix.length), entry]),
  );
  const payload = {
    version: 1 as const,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    userId: identity.user_id,
    createdAt: new Date().toISOString(),
    masterKey: storage.xhs_master_key,
    recovery,
    records,
  };
  validatePayload(payload);
  return payload;
}
export async function restoreBackup(
  payload: BackupPayload,
  verifiedUserId: string,
  request: (path: string, body: unknown) => Promise<unknown> = apiPost,
): Promise<void> {
  await withLock("xhs-settings", async () => {
    const settings = await readSettings();
    const prefix = await recoveryPrefix(settings.backendUrl, settings.apiKey);
    const scope = prefix.slice("xhs_recovery:".length, -1);
    // The same order is used by draft recovery writes (recovery -> master key).
    await withLock(`xhs-recovery:${scope}`, () =>
      withLock("xhs-master-key", () =>
        restoreBackupUnlocked(payload, verifiedUserId, request),
      ),
    );
  });
}
async function restoreBackupUnlocked(
  payload: BackupPayload,
  verifiedUserId: string,
  request: (path: string, body: unknown) => Promise<unknown>,
): Promise<void> {
  validatePayload(payload);
  const settings = await readSettings();
  if (
    normalizeBackendUrl(settings.backendUrl) !==
      normalizeBackendUrl(payload.backendUrl) ||
    verifiedUserId !== payload.userId
  )
    throw new Error("备份的后端地址或账号与当前连接不匹配");
  const before = await chrome.storage.local.get(null);
  if (
    before.xhs_master_key &&
    (!object(before.xhs_master_key) ||
      before.xhs_master_key.keyBase64 !== payload.masterKey.keyBase64 ||
      before.xhs_master_key.saltBase64 !== payload.masterKey.saltBase64)
  )
    throw new Error(
      "当前浏览器已有不同的加密密钥，请使用新的浏览器配置恢复，避免覆盖已有内容的密钥",
    );
  const prefix = await recoveryPrefix(settings.backendUrl, settings.apiKey);
  const local: Record<string, unknown> = { xhs_master_key: payload.masterKey };
  for (const [name, value] of Object.entries(payload.recovery)) {
    // Existing local edits are newer than a backup. Never replace them.
    if (!(prefix + name in before)) local[prefix + name] = value;
  }
  // Backend validates all records in one transaction. Keys never leave this browser.
  await request("/backup/restore", payload.records);
  const current = await chrome.storage.local.get(null);
  if (
    current.xhs_master_key &&
    (!object(current.xhs_master_key) ||
      current.xhs_master_key.keyBase64 !== payload.masterKey.keyBase64 ||
      current.xhs_master_key.saltBase64 !== payload.masterKey.saltBase64)
  )
    throw new Error(
      "恢复期间本地密钥发生变化；服务器记录已导入，本地密钥未更改",
    );
  for (const name of Object.keys(payload.recovery)) {
    if (prefix + name in current) delete local[prefix + name];
  }
  const latestSettings = await readSettings();
  if (
    latestSettings.backendUrl !== settings.backendUrl ||
    latestSettings.apiKey !== settings.apiKey
  )
    throw new Error(
      "恢复期间账号设置发生变化；服务器记录已导入，本地密钥未更改",
    );
  try {
    await chrome.storage.local.set(local);
  } catch {
    throw new Error(
      "服务器记录已导入，但本地恢复写入失败；请保留备份文件并重试",
    );
  }
}
export function downloadBackup(envelope: BackupEnvelope): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `xhs-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
