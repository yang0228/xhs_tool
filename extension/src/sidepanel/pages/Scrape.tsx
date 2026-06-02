import { useState } from "react";
import { apiPost } from "../lib/api";
import { encryptContent, hashContent } from "../lib/crypto";
import { scrapeCurrentPage } from "../lib/scraper";
import { useAppStore } from "../stores/appStore";

export default function Scrape() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [content, setContent] = useState<{ title: string; text: string; url: string } | null>(null);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addToast = useAppStore((s) => s.addToast);

  const handleScrape = async () => {
    setLoading(true);
    setError(null);
    setSummary("");
    try {
      const result = await scrapeCurrentPage();
      setContent({
        title: result.title,
        text: result.textContent.slice(0, 2000),
        url: result.url,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!content) return;

    const { settings } = await chrome.storage.local.get(["settings"]);
    if (!settings?.apiKey) {
      setError("请先在「设置」页面注册 API Key");
      addToast("请先在「设置」页面注册 API Key", "error");
      return;
    }

    setSaving(true);
    try {
      const fullContent = "标题：" + content.title + "\n\n" + content.text;
      const encrypted = await encryptContent(fullContent);
      const hash = await hashContent(fullContent);
      await apiPost("/materials", {
        encrypted_content: encrypted.ciphertext,
        encryption_iv: encrypted.iv,
        encryption_salt: encrypted.salt,
        content_hash: hash,
        source_url: content.url,
        source_title: content.title,
        content_type: "article",
        word_count: fullContent.length,
      });
      addToast("素材已保存到素材库", "success");
      setContent(null);
      setSummary("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSummarize = async () => {
    if (!content) return;
    setAiLoading(true);
    try {
      const res = await apiPost<{ summary: string; key_points: string[] }>("/ai/summarize", {
        content: content.text,
        max_length: 200,
      });
      setSummary(res.summary + "\n\n要点：\n" + res.key_points.map((p, i) => (i + 1) + ". " + p).join("\n"));
      addToast("AI 摘要完成", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "摘要失败", "error");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">抓取素材</h2>
      <p className="text-sm text-gray-500">提取当前网页的核心内容</p>
      <button onClick={handleScrape} disabled={loading}
        className="w-full py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
        {loading ? "提取中..." : "抓取当前页面内容"}
      </button>
      {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
      {content && (
        <div className="space-y-3">
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <h3 className="font-semibold text-sm mb-1">{content.title}</h3>
            <p className="text-xs text-gray-400 truncate">{content.url}</p>
            <p className="text-sm mt-3 text-gray-700 whitespace-pre-wrap line-clamp-[12]">{content.text}</p>
          </div>
          {summary && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800 whitespace-pre-wrap">{summary}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSummarize} disabled={aiLoading}
              className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors">
              {aiLoading ? "摘要中..." : "AI 摘要"}
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
              {saving ? "保存中..." : "保存素材"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
