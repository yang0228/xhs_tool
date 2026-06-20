import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  Draft,
  PaginatedResponse,
  PublishedPost,
} from "../../shared/types";
import { apiGet, apiPost } from "../lib/api";
import { decodeDraft, type DraftDocument } from "../lib/drafts";
import { EmptyState, ErrorNotice } from "../components/UI";
import { useAppStore } from "../stores/appStore";
import Analytics from "./Analytics";

export default function Publish() {
  const [params, setParams] = useSearchParams();
  const draftId = params.get("draft") || "";
  const [tab, setTab] = useState("prepare");
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [postError, setPostError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const addToast = useAppStore((s) => s.addToast);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const results: { id: string; title: string }[] = [];
      let next = 1;
      let count = Infinity;
      while (results.length < count) {
        const data = await apiGet<PaginatedResponse<Draft>>(
          "/drafts?page=" + next + "&limit=100",
          controller.signal,
        );
        count = data.total;
        for (const item of data.items) {
          try {
            results.push({
              id: item.id,
              title: (await decodeDraft(item)).title,
            });
          } catch {
            results.push({ id: item.id, title: "无法解密的草稿" });
          }
        }
        if (!data.items.length) break;
        next++;
      }
      if (!controller.signal.aborted) setOptions(results);
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPostError(null);
    apiGet<PaginatedResponse<PublishedPost>>(
      "/publish/posts?page=" + page + "&limit=20",
      controller.signal,
    )
      .then((data) => {
        setPosts(data.items);
        setTotal(data.total);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setPostError(e.message);
      });
    return () => controller.abort();
  }, [page, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setDraft(null);
    setImageUrls({});
    setImageError(null);
    setError(null);
    if (draftId) {
      setLoading(true);
      apiGet<Draft>("/drafts/" + draftId, controller.signal)
        .then(decodeDraft)
        .then(async (data) => {
          if (controller.signal.aborted) return;
          setDraft(data);
          const pairs = await Promise.all(
            data.image_ids.map(async (id) => {
              try {
                const result = await apiGet<{ download_url: string }>(
                  "/images/" + id + "/download-url",
                  controller.signal,
                );
                return [id, result.download_url] as const;
              } catch (e) {
                if (!controller.signal.aborted)
                  setImageError(
                    e instanceof Error ? e.message : "图片读取失败",
                  );
                return [id, ""] as const;
              }
            }),
          );
          if (!controller.signal.aborted)
            setImageUrls(Object.fromEntries(pairs));
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    } else setLoading(false);
    return () => controller.abort();
  }, [draftId]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast("已复制", "success");
    } catch {
      setError("复制失败，请从预览中手动选择文字复制。");
    }
  };
  const download = async (id: string, index: number) => {
    try {
      // Get a fresh signed URL, since a publishing page may remain open for hours.
      const signed = await apiGet<{ download_url: string }>(
        "/images/" + id + "/download-url",
      );
      const response = await fetch(signed.download_url);
      if (!response.ok) throw new Error("图片下载失败，请重试");
      const blob = await response.blob();
      const local = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = local;
      a.download =
        "配图-" +
        (index + 1) +
        "." +
        ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[
          blob.type
        ] || "jpg");
      a.click();
      setTimeout(() => URL.revokeObjectURL(local), 1000);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "下载失败");
    }
  };
  const record = async () => {
    setError(null);
    setRecording(true);
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname;
      if (
        parsed.protocol !== "https:" ||
        !["xiaohongshu.com", "xhslink.com"].some(
          (d) => host === d || host.endsWith("." + d),
        ) ||
        parsed.pathname === "/" ||
        parsed.username ||
        parsed.password
      )
        throw new Error("请填写实际发布后的小红书 HTTPS 笔记链接");
      await apiPost("/publish/records", {
        draft_id: draftId,
        xhs_post_url: url.trim(),
      });
      setUrl("");
      setRevision((r) => r + 1);
      addToast("发布链接已记录", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "记录失败");
    } finally {
      setRecording(false);
    }
  };
  return (
    <div className="page">
      <div>
        <p className="eyebrow">PUBLISH / 发布</p>
        <h2>让创作被看见</h2>
      </div>
      <div className="tabs">
        <button
          className={tab === "prepare" ? "active" : ""}
          onClick={() => setTab("prepare")}
        >
          发布准备
        </button>
        <button
          className={tab === "analytics" ? "active" : ""}
          onClick={() => setTab("analytics")}
        >
          数据复盘
        </button>
      </div>
      {tab === "analytics" ? (
        <Analytics />
      ) : (
        <>
          <div className="notice">
            准备图文后前往小红书创作中心，由你检查并确认发布。发布完成后记录笔记链接。
          </div>
          <label>
            选择草稿
            <select
              className="field"
              value={draftId}
              onChange={(e) =>
                setParams(e.target.value ? { draft: e.target.value } : {})
              }
            >
              <option value="">请选择已保存的草稿</option>
              {options.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <ErrorNotice error={error} />
          {loading && <p className="loading">正在准备预览…</p>}
          {draft && (
            <>
              <div className="card stack">
                <div className="row between">
                  <h3>{draft.title}</h3>
                  <Link className="text-button" to={"/drafts/" + draftId}>
                    返回编辑
                  </Link>
                </div>
                <p className="note-preview">{draft.content}</p>
                <div className="divider" />
                <p className="help">
                  标题 {Array.from(draft.title).length} 字 · 正文{" "}
                  {Array.from(draft.content).length} 字 · 配图{" "}
                  {draft.image_ids.length} 张。请在创作中心确认字数和图片要求。
                </p>
                <div className="row">
                  <button className="btn" onClick={() => copy(draft.title)}>
                    复制标题
                  </button>
                  <button className="btn" onClick={() => copy(draft.content)}>
                    复制正文
                  </button>
                </div>
              </div>
              <ErrorNotice error={imageError} />
              <div className="image-grid">
                {draft.image_ids.map((id, index) => (
                  <div className="image-tile" key={id}>
                    {imageUrls[id] && (
                      <img src={imageUrls[id]} alt={"配图 " + (index + 1)} />
                    )}
                    <button
                      className="text-button"
                      onClick={() => download(id, index)}
                    >
                      下载图片 {index + 1}
                    </button>
                  </div>
                ))}
              </div>
              <a
                className="btn btn-primary"
                href="https://creator.xiaohongshu.com/"
                target="_blank"
                rel="noreferrer"
              >
                打开小红书创作中心 ↗
              </a>
              <div className="card stack">
                <h3>已经发布？</h3>
                <label htmlFor="published-url">已发布链接</label>
                <input
                  id="published-url"
                  className="field"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.xiaohongshu.com/explore/…"
                />
                <button
                  className="btn"
                  disabled={recording || !url.trim()}
                  onClick={record}
                >
                  {recording ? "记录中…" : "记录发布"}
                </button>
              </div>
            </>
          )}
          <div className="row between">
            <h3>发布记录</h3>
            <span className="muted">{total} 篇</span>
          </div>
          <ErrorNotice
            error={postError}
            retry={() => setRevision((r) => r + 1)}
          />
          {!posts.length && !postError ? (
            <EmptyState
              title="暂无发布记录"
              detail="完成发布后，将笔记链接保存在这里。"
            />
          ) : (
            posts.map((p) => (
              <div className="card row between" key={p.id}>
                <div>
                  <h3>
                    {options.find((d) => d.id === p.draft_id)?.title ||
                      "已发布笔记"}
                  </h3>
                  <p className="help">
                    {new Date(p.published_at).toLocaleString()}
                  </p>
                </div>
                {p.xhs_post_url && (
                  <a
                    className="text-button"
                    href={p.xhs_post_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看笔记 ↗
                  </a>
                )}
              </div>
            ))
          )}
          {total > 20 && (
            <div className="pagination">
              <button
                className="btn"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                className="btn"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
