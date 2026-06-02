import type { EncryptedPayload } from "../../shared/types";

const KEY_STORAGE_KEY = "xhs_master_key";
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function getOrCreateMasterKey(): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const stored = await chrome.storage.local.get([KEY_STORAGE_KEY]);
  if (stored[KEY_STORAGE_KEY]) {
    const { keyBase64, saltBase64 } = stored[KEY_STORAGE_KEY];
    const keyBuffer = base64ToArrayBuffer(keyBase64);
    const key = await crypto.subtle.importKey("raw", keyBuffer, ALGORITHM, false, ["encrypt", "decrypt"]);
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
    return { key, salt };
  }

  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const keyBuffer = await crypto.subtle.exportKey("raw", key);

  await chrome.storage.local.set({
    [KEY_STORAGE_KEY]: {
      keyBase64: arrayBufferToBase64(keyBuffer),
      saltBase64: arrayBufferToBase64(salt.buffer),
    },
  });

  return { key, salt };
}

export async function encryptContent(plaintext: string): Promise<EncryptedPayload> {
  const { key, salt } = await getOrCreateMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer),
  };
}

export async function decryptContent(payload: EncryptedPayload): Promise<string> {
  const { key } = await getOrCreateMasterKey();
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export async function hashContent(plaintext: string): Promise<string> {
  const encoded = new TextEncoder().encode(plaintext);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
