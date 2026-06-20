import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Material, PaginatedResponse } from "../../shared/types";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { readMaterial, type ReadableMaterial } from "../lib/materials";
import { EmptyState, ErrorNotice } from "../components/UI";

export default function Materials() {
  const [items, setItems] = useState<ReadableMaterial[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, ReadableMaterial>>(
    {},
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      const filter = tag ? "&tag=" + encodeURIComponent(tag) : "";
      if (!search) {
        const data = await apiGet<PaginatedResponse<Material>>(
          `/materials?page=${page}&limit=20${filter}`,
          controller.signal,
        );
        const decoded = await Promise.all(data.items.map(readMaterial));
        if (!controller.signal.aborted) {
          setItems(decoded);
          setTotal(data.total);
        }
        return;
      }
      // The server cannot search encrypted bodies. Read bounded pages and search only in memory.
      const matches = new Map<string, ReadableMaterial>();
      let cursor = 1;
      let received = 0;
      let available = Infinity;
      while (received < available) {
        const data = await apiGet<PaginatedResponse<Material>>(
          `/materials?page=${cursor}&limit=100${filter}`,
          controller.signal,
        );
        available = data.total;
        received += data.items.length;
        for (const item of await Promise.all(data.items.map(readMaterial))) {
          if (
            (item.title + "\n" + item.content)
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase())
          )
            matches.set(item.id, item);
        }
        if (!data.items.length) break;
        cursor++;
      }
      if (!controller.signal.aborted) {
        const results = [...matches.values()];
        setItems(results.slice((page - 1) * 20, page * 20));
        setTotal(results.length);
      }
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, tag, revision, search]);
  const toggle = (item: ReadableMaterial) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });
  const start = async (outline = false) => {
    const source = Object.values(selected);
    if (!source.length) return;
    setBusy(true);
    setError(null);
    try {
      let content = source.map((m) => m.content).join("\n\n---\n\n");
      if (outline) {
        const result = await apiPost<{
          outline: { section: string; key_points: string[] }[];
        }>("/ai/outline", {
          materials: source.map((m) => ({
            title: m.title,
            content: m.content,
          })),
        });
        content = result.outline
          .map(
            (s) =>
              s.section + "\n" + s.key_points.map((p) => "• " + p).join("\n"),
          )
          .join("\n\n");
      }
      navigate("/drafts/new", {
        state: {
          seed: {
            title: source.length === 1 ? source[0].title : "新选题",
            content,
            image_ids: [],
          },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiDelete("/materials/" + id);
      setSelected((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeleting(null);
      if (items.length === 1 && page > 1) setPage((p) => p - 1);
      else setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };
  const shown = items;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIBRARY / 灵感库</p>
          <h2>素材库</h2>
        </div>
        <Link className="btn btn-primary" to="/scrape">
          ＋ 采集
        </Link>
      </div>
      <div className="tabs">
        <Link className="active" to="/materials">
          文字素材
        </Link>
        <Link to="/images">图片素材</Link>
      </div>
      <div className="stack">
        <input
          className="field"
          aria-label="搜索素材"
          placeholder="搜索全部素材的标题与正文…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input
          className="field"
          aria-label="按标签筛选"
          placeholder="按标签筛选全部素材"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <ErrorNotice error={error} retry={() => setRevision((r) => r + 1)} />
      {!!Object.keys(selected).length && (
        <div className="card stack">
          <span className="muted">
            已选择 {Object.keys(selected).length} 份素材
          </span>
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => start()}
            >
              带入创作
            </button>
            <button className="btn" disabled={busy} onClick={() => start(true)}>
              {busy ? "处理中…" : "AI 生成提纲"}
            </button>
            <button className="text-button" onClick={() => setSelected({})}>
              清空选择
            </button>
          </div>
          <p className="help">生成提纲时，所选正文会发送给已配置的 AI 服务。</p>
        </div>
      )}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : !error && !items.length ? (
        <EmptyState
          title={search ? "没有匹配的素材" : "暂无素材"}
          detail={
            search ? "请调整关键词或标签后重试" : "抓取网页内容后保存到素材库"
          }
        />
      ) : (
        <div className="stack">
          {shown.map((m) => (
            <article
              className={"card stack " + (selected[m.id] ? "selected" : "")}
              key={m.id}
            >
              <div className="row between">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!selected[m.id]}
                    disabled={m.unreadable}
                    onChange={() => toggle(m)}
                  />
                  <span className="material-title">{m.title}</span>
                </label>
                <span className="badge">{m.word_count || 0} 字</span>
              </div>
              {m.unreadable ? (
                <p className="error">
                  无法解密，请恢复原始密钥；原始密文仍保留。
                </p>
              ) : (
                <p
                  className={
                    expanded === m.id ? "note-preview" : "preview-text"
                  }
                >
                  {m.summary || m.content}
                </p>
              )}
              {expanded === m.id && m.summary && (
                <p className="note-preview">{m.content}</p>
              )}
              <div className="row">
                {(m.tags || []).map((t) => (
                  <button
                    className="badge"
                    key={t}
                    onClick={() => {
                      setTag(t);
                      setPage(1);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="row between">
                <span className="muted">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
                <div className="row">
                  {m.source_url && /^https?:\/\//i.test(m.source_url) && (
                    <a
                      className="text-button"
                      href={m.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      原文 ↗
                    </a>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  >
                    {expanded === m.id ? "收起" : "查看全文"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setDeleting(m.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
              {deleting === m.id && (
                <div className="notice">
                  删除这份素材？已有草稿会保留。
                  <div className="row">
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => remove(m.id)}
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
          {!shown.length && !!items.length && (
            <p className="muted">没有匹配内容，请调整关键词。</p>
          )}
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
          第 {page} 页 · 共 {total} 份
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
