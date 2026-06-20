import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";
import { encryptContent, hashContent } from "../lib/crypto";
import { readSettings } from "../lib/settings";
import { scrapeCurrentPage } from "../lib/scraper";
import { useAppStore } from "../stores/appStore";
import { ErrorNotice, Icon } from "../components/UI";

export default function Scrape() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [content, setContent] = useState<{
    title: string;
    text: string;
    url: string;
  } | null>(null);
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const addToast = useAppStore((s) => s.addToast);
  const navigate = useNavigate();
  const collect = async (selection = false) => {
    setLoading(true);
    setError(null);
    setSummary("");
    setSaved(false);
    try {
      if (selection) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("未找到当前网页");
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            text: window.getSelection()?.toString() || "",
            title: document.title,
            url: location.href,
          }),
        });
        const value = result[0]?.result;
        if (!value?.text.trim())
          throw new Error("请先在网页中选中要采集的文字");
        setContent(value);
      } else {
        const result = await scrapeCurrentPage();
        setContent({
          title: result.title,
          text: result.textContent,
          url: result.url,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "采集失败");
    } finally {
      setLoading(false);
    }
  };
  const save = async () => {
    if (!content?.text.trim() || !content.title.trim()) {
      setError("请填写素材标题和正文");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (!(await readSettings()).apiKey)
        throw new Error("请先在设置中连接账户");
      const plain = JSON.stringify({
        format: 2,
        title: content.title,
        content: content.text,
        summary,
      });
      const encrypted = await encryptContent(plain);
      const hash = await hashContent(
        JSON.stringify([content.title.trim(), content.text.trim()]),
      );
      await apiPost("/materials", {
        encrypted_content: encrypted.ciphertext,
        encryption_iv: encrypted.iv,
        encryption_salt: encrypted.salt,
        content_hash: hash,
        source_url: content.url || null,
        source_title: content.title,
        content_type: content.url ? "article" : "note",
        word_count: content.text.length,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setSaved(true);
      addToast("素材已保存，重复内容会自动合并", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const summarize = async () => {
    if (!content?.text.trim()) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ summary: string; key_points: string[] }>(
        "/ai/summarize",
        { content: content.text, max_length: 200 },
      );
      setSummary(
        res.summary + "\n\n" + res.key_points.map((p) => "• " + p).join("\n"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "摘要失败");
    } finally {
      setAiLoading(false);
    }
  };
  return (
    <div className="page">
      <div>
        <p className="eyebrow">COLLECT / 采集</p>
        <h2>发现值得记录的灵感</h2>
      </div>
      <p className="muted">从正在阅读的网页开始，建立自己的素材库。</p>
      <div className="card capture-hero">
        <h3>把好内容留在手边</h3>
        <p>提取文章正文，保留完整内容和来源。</p>
        <button
          className="btn btn-primary btn-wide"
          disabled={loading}
          onClick={() => collect()}
        >
          <Icon name="collect" size={17} />
          {loading ? "提取中..." : "抓取当前页面内容"}
        </button>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => collect(true)}
          >
            采集选中文字
          </button>
          <button
            className="text-button"
            onClick={() => {
              setContent({ title: "", text: "", url: "" });
              setSummary("");
              setError(null);
              setSaved(false);
            }}
          >
            手动粘贴
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {content && (
        <>
          <div className="card stack">
            <label>
              素材标题
              <input
                className="field"
                value={content.title}
                onChange={(e) => {
                  setContent({ ...content, title: e.target.value });
                  setSaved(false);
                }}
              />
            </label>
            <label>
              素材正文
              <textarea
                className="field"
                rows={8}
                value={content.text}
                onChange={(e) => {
                  setContent({ ...content, text: e.target.value });
                  setSaved(false);
                }}
              />
            </label>
            <div className="row between">
              <span className="muted">
                已提取 {content.text.length.toLocaleString()} 字
              </span>
              {content.url && (
                <a
                  className="source-link"
                  href={
                    /^https?:\/\//i.test(content.url) ? content.url : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  查看原文 ↗
                </a>
              )}
            </div>
            <label>
              标签
              <input
                className="field"
                placeholder="例如：旅行，美食，选题"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
            <p className="help">
              用逗号分隔标签。AI 摘要会发送当前正文给已配置的 AI 服务。
            </p>
          </div>
          {summary && (
            <div className="card suggestion">
              <h3>内容摘要</h3>
              <p className="suggestion-output">{summary}</p>
            </div>
          )}
          <div className="row">
            <button
              className="btn"
              disabled={aiLoading || !content.text.trim()}
              onClick={summarize}
            >
              {aiLoading ? "摘要中…" : "AI 摘要"}
            </button>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={save}
            >
              {saving ? "保存中…" : "保存素材"}
            </button>
            <button
              className="btn"
              onClick={() =>
                navigate("/drafts/new", {
                  state: {
                    seed: {
                      title: content.title,
                      content: content.text,
                      image_ids: [],
                    },
                  },
                })
              }
            >
              开始创作 →
            </button>
          </div>
          {saved && (
            <p className="success">
              素材已保存。
              <Link className="text-button" to="/materials">
                前往素材库
              </Link>
            </p>
          )}
        </>
      )}
      {!content && (
        <div className="card">
          <p className="eyebrow">你的创作路径</p>
          <h3>采集 → 整理 → 创作 → 发布</h3>
          <p className="muted" style={{ marginTop: 8 }}>
            保存灵感，组合素材，再用自己的表达写成一篇笔记。
          </p>
        </div>
      )}
    </div>
  );
}
