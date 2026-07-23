import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  Draft,
  PaginatedResponse,
  PublishedPost,
} from "../../shared/types";
import { apiGet, apiPost, type ApiIdentity } from "../lib/api";
import { decodeDraft, type DraftDocument } from "../lib/drafts";
import { EmptyState, ErrorNotice, PageHeading } from "../components/UI";
import { useAppStore } from "../stores/appStore";
import Analytics from "./Analytics";
import PublishSchedule from "../components/PublishSchedule";
import PublicationSnapshot from "../components/PublicationSnapshot";
import { buildPublicationZip, downloadBlob } from "../lib/cards";
import {
  checkSavedVersion,
  encodePublicationSnapshot,
  localDateTime,
  validatePublication,
} from "../lib/publication";
import { readSettings } from "../lib/settings";

export default function Publish() {
  const [params, setParams] = useSearchParams();
  const draftId = params.get("draft") || "";
  const [tab, setTab] = useState("prepare");
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [postIdentity, setPostIdentity] = useState<ApiIdentity>();
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
  const [recordVersion, setRecordVersion] = useState(0),
    [exportedVersion, setExportedVersion] = useState<number | null>(null),
    [exporting, setExporting] = useState(false),
    [reload, setReload] = useState(0),
    [referencesReviewed, setReferencesReviewed] = useState(false);
  const [publishedAt, setPublishedAt] = useState(() => localDateTime());
  const [identity, setIdentity] = useState<ApiIdentity>();
  const operation = useRef(0);
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
    setPosts([]);
    readSettings()
      .then(async (origin) => {
        const data = await apiGet<PaginatedResponse<PublishedPost>>(
          "/publish/posts?page=" + page + "&limit=20",
          controller.signal,
          origin,
        );
        if (!controller.signal.aborted) {
          setPostIdentity(origin);
          setPosts(data.items);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setPostError(e.message);
      });
    return () => controller.abort();
  }, [page, revision]);
  useEffect(() => {
    const controller = new AbortController();
    operation.current++;
    setDraft(null);
    setRecordVersion(0);
    setExportedVersion(null);
    setReferencesReviewed(false);
    setExporting(false);
    setImageUrls({});
    setImageError(null);
    setError(null);
    if (draftId) {
      setLoading(true);
      readSettings()
        .then(async (origin) => {
          const result = await apiGet<Draft>(
            "/drafts/" + draftId,
            controller.signal,
            origin,
          );
          if (!controller.signal.aborted) {
            setIdentity(origin);
            setRecordVersion(result.version);
          }
          return decodeDraft(result);
        })
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
    return () => {
      controller.abort();
      operation.current++;
    };
  }, [draftId, reload]);
  const frozenDraft = async () => {
    if (!draft || !recordVersion) throw new Error("请先选择并读取已保存草稿");
    const frozen = structuredClone(draft);
    await validatePublication(frozen);
    if (frozen.context?.references.length && !referencesReviewed)
      throw new Error("请先逐条核对素材引用并勾选确认");
    await checkSavedVersion(draftId, recordVersion, identity);
    return frozen;
  };
  const exportPackage = async () => {
    const current = operation.current,
      version = recordVersion;
    setExporting(true);
    setError(null);
    try {
      const frozen = await frozenDraft();
      const blob = await buildPublicationZip(
        { ...frozen, context: frozen.context ?? undefined },
        identity,
      );
      await checkSavedVersion(draftId, version, identity);
      if (current !== operation.current) return;
      downloadBlob(blob, "xhs-publication-v" + version + ".zip");
      setExportedVersion(version);
    } catch (e) {
      if (current === operation.current)
        setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      if (current === operation.current) setExporting(false);
    }
  };
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
      const frozen = await frozenDraft();
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
      await apiPost(
        "/publish/records",
        {
          draft_id: draftId,
          xhs_post_url: url.trim(),
          expected_version: recordVersion,
          snapshot: await encodePublicationSnapshot(frozen, recordVersion),
          template_id: frozen.context?.cards?.template ?? null,
          published_at: new Date(publishedAt).toISOString(),
        },
        undefined,
        identity,
      );
      setUrl("");
      setRevision((r) => r + 1);
      setReload((r) => r + 1);
      addToast("发布链接已记录", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "记录失败");
    } finally {
      setRecording(false);
    }
  };
  return (
    <div className="page">
      <PageHeading eyebrow="PUBLISH / 发布" title="让创作被看见" />
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
        <button
          className={tab === "schedule" ? "active" : ""}
          onClick={() => setTab("schedule")}
        >
          发布排期
        </button>
      </div>
      {tab === "schedule" ? (
        <PublishSchedule />
      ) : tab === "analytics" ? (
        <Analytics embedded />
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
                {!!draft.context?.references.length && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={referencesReviewed}
                      onChange={(e) => setReferencesReviewed(e.target.checked)}
                    />
                    我已逐条核对本篇素材引用
                  </label>
                )}
                <div className="row">
                  <button
                    className="btn btn-primary"
                    disabled={exporting || recording}
                    onClick={() => void exportPackage()}
                  >
                    {exporting ? "生成发布包中…" : "导出完整发布包 ZIP"}
                  </button>
                  <button
                    className="text-button"
                    disabled={exporting || recording}
                    onClick={() => setReload((r) => r + 1)}
                  >
                    重新加载草稿
                  </button>
                </div>
                <p className="help">
                  预览对应已保存草稿 v{recordVersion}。
                  {exportedVersion
                    ? `已导出 v${exportedVersion}；继续修改后需重新导出。`
                    : "发布包包含标题、正文、来源和有序图片。"}
                </p>
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
                <label>
                  实际发布时间
                  <input
                    className="field"
                    type="datetime-local"
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                  />
                </label>
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
              <div className="card stack" key={p.id}>
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
                {postIdentity && (
                  <PublicationSnapshot post={p} identity={postIdentity} />
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
