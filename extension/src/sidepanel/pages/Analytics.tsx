import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { EmptyState, ErrorNotice } from "../components/UI";
interface Metrics {
  view_count: number;
  like_count: number;
  comment_count: number;
  collect_count: number;
  share_count: number;
  collected_at?: string;
}
interface Post {
  post_id: string;
  xhs_post_url: string | null;
  published_at: string;
  latest: Metrics | null;
  history: Metrics[];
}
const fields = [
  ["view_count", "阅读"],
  ["like_count", "点赞"],
  ["comment_count", "评论"],
  ["collect_count", "收藏"],
  ["share_count", "分享"],
] as const;
const zero: Metrics = {
  view_count: 0,
  like_count: 0,
  comment_count: 0,
  collect_count: 0,
  share_count: 0,
};
function MetricForm({ post, onSaved }: { post: Post; onSaved: () => void }) {
  const [values, setValues] = useState<Metrics>({ ...zero, ...post.latest });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card stack">
      <div className="row between">
        <span className="badge">手动记录</span>
        {post.xhs_post_url && (
          <a
            className="text-button"
            href={post.xhs_post_url}
            target="_blank"
            rel="noreferrer"
          >
            查看笔记 ↗
          </a>
        )}
      </div>
      <p className="muted">
        发布于 {new Date(post.published_at).toLocaleDateString()}
      </p>
      <div className="metrics-grid">
        {fields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              className="field"
              aria-label={label}
              type="number"
              min={0}
              step={1}
              value={values[key]}
              onChange={(e) =>
                setValues({ ...values, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <ErrorNotice error={error} />
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            if (
              fields.some(
                ([key]) =>
                  !Number.isSafeInteger(values[key]) || values[key] < 0,
              )
            )
              throw new Error("指标必须是非负整数");
            const payload = Object.fromEntries(
              fields.map(([key]) => [key, values[key]]),
            );
            await apiPost("/analytics/posts/" + post.post_id, payload);
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "保存中…" : "保存本次数据"}
      </button>
      <p className="help">
        {post.latest?.collected_at
          ? "最近记录：" + new Date(post.latest.collected_at).toLocaleString()
          : "尚未记录指标"}{" "}
        · 共 {post.history.length} 次记录
      </p>
      {post.history.length > 1 && (
        <details>
          <summary className="text-button">查看历史记录</summary>
          {post.history.map((m, i) => (
            <p className="help" key={i}>
              {new Date(m.collected_at || "").toLocaleString()} · 阅读{" "}
              {m.view_count} · 点赞 {m.like_count} · 收藏 {m.collect_count}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
export default function Analytics() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [days, setDays] = useState(90);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<{ posts: Post[] }>(
      "/analytics/posts?days=" + days,
      controller.signal,
    )
      .then((data) => setPosts(data.posts))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, revision]);
  const total = posts.reduce(
    (sum, p) => {
      for (const [key] of fields) sum[key] += p.latest?.[key] || 0;
      return sum;
    },
    { ...zero },
  );
  return (
    <div className="page">
      <div className="row between">
        <h2>数据复盘</h2>
        <select
          className="field"
          style={{ width: "auto" }}
          aria-label="数据时间范围"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
          <option value={365}>近一年</option>
        </select>
      </div>
      <p className="muted">
        记录创作中心的真实数据，观察每篇笔记的表现。当前使用手动录入。
      </p>
      <ErrorNotice error={error} retry={() => setRevision((r) => r + 1)} />
      <div className="metrics-grid">
        {fields.slice(0, 4).map(([key, label]) => (
          <div className="metric" key={key}>
            <strong>{total[key].toLocaleString()}</strong>
            <p>{label}</p>
          </div>
        ))}
      </div>
      {loading ? (
        <p className="loading">加载中...</p>
      ) : !error && !posts.length ? (
        <EmptyState
          title="暂无发布记录"
          detail="记录笔记链接后，即可在这里填写和比较数据。"
        />
      ) : (
        posts.map((p) => (
          <MetricForm
            key={p.post_id + ":" + revision}
            post={p}
            onSaved={() => setRevision((r) => r + 1)}
          />
        ))
      )}
    </div>
  );
}
