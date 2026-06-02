import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Draft } from "../../shared/types";
import ContentCard from "../components/ContentCard";
import { apiDelete, apiGet } from "../lib/api";
import { decryptContent } from "../lib/crypto";

type DecryptedDraft = Draft & { _title?: string; _preview?: string };

export default function Drafts() {
  const [drafts, setDrafts] = useState<DecryptedDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Draft[]; total: number }>("/drafts?page=1&limit=50");
      const items = await Promise.all(
        data.items.map(async (d) => {
          try {
            const title = await decryptContent({ ciphertext: d.encrypted_title, iv: d.encryption_iv, salt: d.encryption_salt });
            const preview = await decryptContent({ ciphertext: d.encrypted_content, iv: d.encryption_iv, salt: d.encryption_salt });
            return { ...d, _title: title, _preview: preview.slice(0, 150) };
          } catch {
            return { ...d, _title: "(解密失败)", _preview: "" };
          }
        })
      );
      setDrafts(items);
    } catch { /* unreachable */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const handleDelete = async (id: string) => {
    try {
      await apiDelete("/drafts/" + id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">草稿</h2>
        </div>
        <div className="text-center py-12 text-gray-400"><p className="text-sm">加载中...</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">草稿</h2>
        <Link to="/drafts/new"
          className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors">
          新建
        </Link>
      </div>
      {drafts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">✏️</p>
          <p className="text-sm">暂无草稿</p>
          <p className="text-xs mt-1">从素材创建草稿，或直接开始写作</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Link key={d.id} to={"/drafts/" + d.id}>
              <ContentCard
                title={d._title || "无标题"}
                preview={d._preview || ""}
                date={d.updated_at}
                onDelete={() => handleDelete(d.id)}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
