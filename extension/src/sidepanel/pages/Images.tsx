import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageRecord } from "../../shared/types";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { useAppStore } from "../stores/appStore";

export default function Images() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addToast = useAppStore((s) => s.addToast);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: ImageRecord[]; total: number }>("/images?page=1&limit=50");
      setImages(data.items);
    } catch { /* unreachable */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { upload_url, r2_key } = await apiPost<{ upload_url: string; r2_key: string; expires_in: number }>(
        "/images/upload-url", { filename: file.name, mime_type: file.type, file_size: file.size }
      );
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await apiPost("/images/confirm", { r2_key });
      addToast("图片上传成功", "success");
      fetchImages();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "上传失败", "error");
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete("/images/" + id);
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">图片库</h2>
        <div className="text-center py-12 text-gray-400"><p className="text-sm">加载中...</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">图片库</h2>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-red-300 hover:text-red-500 disabled:opacity-50 transition-colors">
        {uploading ? "上传中..." : "+ 上传图片到 R2"}
      </button>
      {images.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🖼️</p>
          <p className="text-sm">暂无图片</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img src={img.r2_url} alt="" className="w-full h-24 object-cover rounded-lg" />
              <button onClick={() => handleDelete(img.id)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center">
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
