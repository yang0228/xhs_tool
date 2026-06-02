import { useCallback, useEffect, useState } from "react";
import type { Material } from "../../shared/types";
import ContentCard from "../components/ContentCard";
import { apiDelete, apiGet } from "../lib/api";
import { decryptContent } from "../lib/crypto";

type DecryptedMaterial = Material & { _title?: string; _preview?: string };

export default function Materials() {
  const [materials, setMaterials] = useState<DecryptedMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Material[]; total: number }>("/materials?page=1&limit=50");
      const items = await Promise.all(
        data.items.map(async (m) => {
          try {
            const plain = await decryptContent({
              ciphertext: m.encrypted_content,
              iv: m.encryption_iv,
              salt: m.encryption_salt,
            });
            const title = m.source_title || plain.split("\n")[0]?.replace(/^标题：/, "") || "无标题";
            return { ...m, _title: title, _preview: plain.slice(0, 150) };
          } catch {
            return { ...m, _title: m.source_title || "(解密失败)", _preview: "" };
          }
        })
      );
      setMaterials(items);
    } catch {
      // API unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/materials/${id}`);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">素材库</h2>
        <div className="text-center py-12 text-gray-400"><p className="text-sm">加载中...</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">素材库</h2>
      {materials.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📁</p>
          <p className="text-sm">暂无素材</p>
          <p className="text-xs mt-1">抓取网页内容后保存到素材库</p>
        </div>
      ) : (
        <div className="space-y-3">
          {materials.map((m) => (
            <ContentCard
              key={m.id}
              title={m._title || "无标题"}
              preview={m._preview || ""}
              url={m.source_url}
              date={m.created_at}
              onDelete={() => handleDelete(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
