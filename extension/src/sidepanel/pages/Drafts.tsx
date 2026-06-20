import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Draft, PaginatedResponse } from "../../shared/types";
import { apiDelete, apiGet } from "../lib/api";
import { clearRecovery, decodeDraft } from "../lib/drafts";
import { EmptyState, ErrorNotice } from "../components/UI";

type Item = Draft & { title: string; preview: string; unreadable?: boolean };
export default function Drafts() {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<PaginatedResponse<Draft>>(
      `/drafts?page=${page}&limit=20${status ? "&status=" + status : ""}`,
      controller.signal,
    )
      .then(async (data) => {
        const decoded = await Promise.all(
          data.items.map(async (d) => {
            try {
              const doc = await decodeDraft(d);
              return {
                ...d,
                title: doc.title,
                preview: doc.content.slice(0, 180),
              };
            } catch {
              return {
                ...d,
                title: "需要恢复的草稿",
                preview: "解密失败。请恢复原始密钥或完整备份，原始密文已保留。",
                unreadable: true,
              };
            }
          }),
        );
        if (!controller.signal.aborted) {
          setItems(decoded);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, status, revision]);
  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete("/drafts/" + id);
      await clearRecovery(id);
      setDeleting(null);
      if (items.length === 1 && page > 1) setPage((p) => p - 1);
      else setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CREATE / 创作</p>
          <h2>草稿</h2>
        </div>
        <Link className="btn btn-primary" to="/drafts/new">
          新建
        </Link>
      </div>
      <p className="muted">从灵感到成稿，每一次修改都值得保存。</p>
      <div className="tabs">
        {[
          ["", "全部"],
          ["draft", "写作中"],
          ["published", "已发布"],
        ].map(([value, text]) => (
          <button
            key={value}
            className={status === value ? "active" : ""}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <ErrorNotice error={error} retry={() => setRevision((r) => r + 1)} />
      {loading ? (
        <div className="loading">加载中...</div>
      ) : !error && !items.length ? (
        <EmptyState title="暂无草稿" detail="从素材创建草稿，或直接开始写作">
          <Link className="btn" to="/drafts/new">
            开始第一篇笔记
          </Link>
        </EmptyState>
      ) : (
        <div className="stack">
          {items.map((d) => (
            <article key={d.id} className="card stack">
              <Link className="stack" to={"/drafts/" + d.id}>
                <div className="row between">
                  <h3>{d.title}</h3>
                  <span className="badge">
                    {d.status === "published" ? "已发布" : "写作中"}
                  </span>
                </div>
                <p className="preview-text">{d.preview}</p>
              </Link>
              <div className="row between">
                <span className="muted">
                  {new Date(d.updated_at).toLocaleString()} · v{d.version}
                </span>
                <button
                  className="text-button"
                  onClick={() => setDeleting(d.id)}
                >
                  删除
                </button>
              </div>
              {deleting === d.id && (
                <div className="notice">
                  删除这份草稿？
                  <div className="row">
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => remove(d.id)}
                    >
                      确认删除
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setDeleting(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          className="btn"
          disabled={page === 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>
          第 {page} 页 · 共 {total} 篇
        </span>
        <button
          className="btn"
          disabled={page * 20 >= total || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
