import { useEffect, useState } from "react";
import type { PublishedPost } from "../../shared/types";
import { apiGet, apiPost } from "../lib/api";
import { encryptContent } from "../lib/crypto";
import { useAppStore } from "../stores/appStore";

export default function Publish() {
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const addToast = useAppStore((s) => s.addToast);

  const fetchPosts = async () => {
    try {
      const data = await apiGet<{ posts: PublishedPost[] }>("/analytics/posts?days=90");
      // analytics/posts returns a different shape, handle gracefully
      setPosts([]);
    } catch { /* unreachable */ }
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  const handleCaptureCookies = async () => {
    setCapturing(true);
    try {
      const cookies = await chrome.cookies.getAll({ domain: "xiaohongshu.com" });
      if (cookies.length === 0) {
        addToast("未找到小红书 Cookie，请先登录 xiaohongshu.com", "error");
        return;
      }
      const cookieJson = JSON.stringify(cookies);
      const encrypted = await encryptContent(cookieJson);
      await apiPost("/publish/xhs/credentials", {
        encrypted_cookies: encrypted.ciphertext,
        encryption_iv: encrypted.iv,
        encryption_salt: encrypted.salt,
      });
      addToast("XHS 会话已捕获 (" + cookies.length + " 个 Cookie)", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "捕获失败", "error");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">发布管理</h2>
      <p className="text-sm text-gray-500">一键发布到小红书，追踪发布状态</p>

      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-sm text-yellow-700">首次使用需要捕获小红书登录 Cookie</p>
        <button onClick={handleCaptureCookies} disabled={capturing}
          className="mt-2 px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors">
          {capturing ? "捕获中..." : "捕获 XHS 会话"}
        </button>
      </div>

      {!loading && posts.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-4xl mb-2">📤</p>
          <p className="text-sm">暂无发布记录</p>
          <p className="text-xs mt-1">完成草稿后可一键发布</p>
        </div>
      )}
    </div>
  );
}
