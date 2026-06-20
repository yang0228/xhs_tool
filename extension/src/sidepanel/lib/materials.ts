import type { Material } from "../../shared/types";
import { decryptContent } from "./crypto";
export type ReadableMaterial = Material & {
  title: string;
  content: string;
  summary: string;
  unreadable?: boolean;
};
export async function readMaterial(
  material: Material,
): Promise<ReadableMaterial> {
  try {
    const plain = await decryptContent({
      ciphertext: material.encrypted_content,
      iv: material.encryption_iv,
      salt: material.encryption_salt,
    });
    try {
      const data = JSON.parse(plain);
      if (data.format === 2 && typeof data.content === "string")
        return {
          ...material,
          title: data.title || material.source_title || "未命名素材",
          content: data.content,
          summary: data.summary || "",
        };
    } catch {
      /* Legacy materials contain plain text inside their encrypted envelope. */
    }
    return {
      ...material,
      title:
        material.source_title ||
        plain.split("\n")[0].replace(/^标题：/, "") ||
        "未命名素材",
      content: plain,
      summary: "",
    };
  } catch {
    return {
      ...material,
      title: material.source_title || "无法解密的素材",
      content: "",
      summary: "",
      unreadable: true,
    };
  }
}
