import { useState } from "react";
import { useParams } from "react-router-dom";
import { apiPost, apiPostStream } from "../lib/api";
import { encryptContent, hashContent } from "../lib/crypto";
import { useAppStore } from "../stores/appStore";

export default function Editor() {
  const { id } = useParams();
  const isNew = id === "new";
  const addToast = useAppStore((s) => s.addToast);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState("");

  const aiAction = async (action: string) => {
    if (!content) { addToast("请先输入内容", "error"); return; }
    setLoading(action);
    try {
      if (action === "titles") {
        const res = await apiPost<{ titles: string[] }>("/ai/generate-titles", { content, count: 3 });
        setTitle(res.titles[0] || "");
        addToast("标题已生成", "success");
      } else if (action === "rewrite") {
        const result = await apiPostStream("/ai/rewrite", { content, style: "小红书" }, () => {});
        setContent(result);
        addToast("改写完成", "success");
      } else if (action === "polish") {
        const res = await apiPost<{ polished: string }>("/ai/polish", { content });
        setContent(res.polished);
        addToast("润色完成", "success");
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : "AI 操作失败", "error");
    } finally { setLoading(""); }
  };

  const handleSave = async () => {
    if (!title || !content) { addToast("标题和内容不能为空", "error"); return; }
    setLoading("save");
    try {
      const encTitle = await encryptContent(title);
      const encContent = await encryptContent(content);
      const titleHash = await hashContent(title);
      await apiPost("/drafts", {
        encrypted_title: encTitle.ciphertext,
        encrypted_content: encContent.ciphertext,
        encryption_iv: encTitle.iv,
        encryption_salt: encTitle.salt,
        title_hash: titleHash,
        status: "draft",
      });
      addToast("草稿已保存", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "保存失败", "error");
    } finally { setLoading(""); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{isNew ? "新建草稿" : "编辑草稿"}</h2>
      <p className="text-sm text-gray-500">AI 辅助写作，适配小红书风格</p>
      <div className="space-y-3">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="输入标题（最多20字）" maxLength={20}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-300" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="开始写作... 或使用 AI 工具生成内容" rows={10} maxLength={1000}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-300 resize-none" />
        <div className="text-xs text-gray-400 text-right">{content.length} / 1000</div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => aiAction("titles")} disabled={loading !== ""}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
          {loading === "titles" ? "生成中..." : "AI 生成标题"}
        </button>
        <button onClick={() => aiAction("rewrite")} disabled={loading !== ""}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
          {loading === "rewrite" ? "改写中..." : "AI 改写"}
        </button>
        <button onClick={() => aiAction("polish")} disabled={loading !== ""}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
          {loading === "polish" ? "润色中..." : "AI 润色"}
        </button>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} disabled={loading !== ""}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors">
          {loading === "save" ? "保存中..." : "保存草稿"}
        </button>
        <button onClick={() => addToast("请先在 Publish 页面捕获 XHS Cookie", "info")}
          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
          发布
        </button>
      </div>
    </div>
  );
}
