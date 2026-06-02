import { useCallback, useEffect, useState } from "react";
import { decryptContent, encryptContent, getOrCreateMasterKey, hashContent } from "../lib/crypto";
import type { EncryptedPayload } from "../../shared/types";

export function useEncryption() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getOrCreateMasterKey().then(() => setReady(true));
  }, []);

  const encrypt = useCallback(async (plaintext: string) => {
    return encryptContent(plaintext);
  }, []);

  const decrypt = useCallback(async (payload: EncryptedPayload) => {
    return decryptContent(payload);
  }, []);

  const hash = useCallback(async (plaintext: string) => {
    return hashContent(plaintext);
  }, []);

  return { ready, encrypt, decrypt, hash };
}
