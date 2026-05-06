import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, type ApiIdentity } from "../lib/api";
import { emptyContext } from "../lib/creator";
import { recoveryScope } from "../lib/drafts";
import { readSettings } from "../lib/settings";
import { ErrorNotice } from "./UI";

interface ImportResult {
  rows: {
    row: number;
    post_id: string;
    collected_at: string;
    view_count: number;
  }[];
  errors: { row: number; message: string }[];
  imported: number;
  skipped: number;
}
interface Insight {
  kind: "topic" | "template";
  name: string;
  sample_count: number;
  total_posts: number;
  missing_count: number;
  average_views: number | null;
  average_interactions: number | null;
  interaction_rate: number | null;
  post_ids: string[];
  observation_ages_hours: number[];
}
interface Review {
  observations: string[];
  ideas: { title: string; reason: string; post_ids: string[] }[];
  limitations: string[];
}

export default function ContentReview({
  onImported,
}: {
  onImported: () => void;
}) {
  const [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<ImportResult | null>(null),
    [previewText, setPreviewText] = useState(""),
    [hours, setHours] = useState(24),
    [groups, setGroups] = useState<Insight[]>([]),
    [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const controller = useRef(new AbortController());
  const [reviewScope, setReviewScope] = useState("");
  const [previewIdentity, setPreviewIdentity] = useState<ApiIdentity>();
  useEffect(() => () => controller.current.abort(), []);
  const importCsv = async (confirm = false) => {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const identity = confirm ? previewIdentity : await readSettings();
      if (!identity) throw new Error("请重新预览 CSV");
      const result = await apiPost<ImportResult>(
        "/analytics/import",
        { csv_text: csv, confirm },
        controller.current.signal,
        identity,
      );
      setPreview(result);
      setPreviewText(csv);
      setPreviewIdentity(identity);
      if (confirm) {
        setMessage(
          `已导入 ${result.imported} 条，跳过 ${result.skipped} 条重复记录`,
        );
        onImported();
        setReview(null);
        setGroups([]);
      }
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  const analyze = async () => {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const identity = await readSettings();
      const [insights, result] = await Promise.all([
        apiGet<{ groups: Insight[] }>(
          "/analytics/insights?window_hours=" + hours,
          controller.current.signal,
          identity,
        ),
        apiGet<Review>(
          "/analytics/review?window_hours=" + hours,
          controller.current.signal,
          identity,
        ),
      ]);
      if (!Array.isArray(insights.groups) || !Array.isArray(result.ideas))
        throw new Error("复盘响应格式无效");
      const scope = await recoveryScope(identity);
      setGroups(insights.groups);
      setReview(result);
      setReviewScope(scope);
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "复盘失败");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="stack">
      <details className="card stack">
        <summary>从 CSV 导入指标</summary>
        <div className="stack">
          <p className="help">
            每行是一次累计指标观察，最多 500
            行。表头：xhs_post_url,collected_at,view_count,like_count,comment_count,share_count,collect_count；时间带时区，例如
            2026-10-17T10:00:00+08:00。也可用 post_id 代替链接。
          </p>
          <label>
            选择指标 CSV
            <input
              className="field"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2_000_000)
                    throw new Error("CSV 文件过大，请分成每批最多 500 行");
                  setCsv(await file.text());
                  setPreview(null);
                  setError(null);
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "文件读取失败",
                  );
                }
              }}
            />
          </label>
          <label>
            CSV 内容
            <textarea
              className="field"
              rows={6}
              value={csv}
              maxLength={1_000_000}
              disabled={busy}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button
            className="btn"
            disabled={busy || !csv.trim()}
            onClick={() => void importCsv()}
          >
            预览并校验 CSV
          </button>
          {preview && (
            <div className="stack">
              <p>
                通过 {preview.rows.length} 行 · 错误 {preview.errors.length} 行
                · 重复 {preview.skipped} 行
              </p>
              {preview.errors.map((e, i) => (
                <p className="error" key={i}>
                  第 {e.row} 行：{e.message}
                </p>
              ))}
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>行</th>
                      <th>发布记录</th>
                      <th>观察时间</th>
                      <th>阅读</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.row}</td>
                        <td>{r.post_id.slice(0, 8)}</td>
                        <td>{new Date(r.collected_at).toLocaleString()}</td>
                        <td>{r.view_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="help">预览前 20 行；确认时会重新校验整批数据。</p>
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !!preview.errors.length ||
                  !preview.rows.length ||
                  previewText !== csv
                }
                onClick={() => void importCsv(true)}
              >
                确认导入 CSV
              </button>
            </div>
          )}
        </div>
      </details>
      <div className="card stack">
        <h3>主题与模板复盘</h3>
        <label>
          对比观察时长
          <select
            className="field"
            disabled={busy}
            value={hours}
            onChange={(e) => {
              setHours(Number(e.target.value));
              setGroups([]);
              setReview(null);
            }}
          >
            <option value={24}>发布后 24 小时</option>
            <option value={72}>发布后 72 小时</option>
          </select>
        </label>
        <p className="help">
          选用目标时点前后 3
          小时内最近的一次观察；缺数据就留空。主题可以重叠，统计不用于因果判断。
        </p>
        <button className="btn" disabled={busy} onClick={() => void analyze()}>
          生成复盘建议
        </button>
        {groups.map((g) => (
          <div className="card stack" key={g.kind + g.name}>
            <h4>
              {g.kind === "topic" ? "主题" : "模板"} ·{" "}
              {(
                {
                  checklist: "清单",
                  steps: "步骤",
                  none: "未使用模板",
                } as Record<string, string>
              )[g.name] ?? g.name}
            </h4>
            <p>
              有效样本 {g.sample_count}/{g.total_posts} · 缺数据{" "}
              {g.missing_count}
            </p>
            <p className="help">
              平均阅读{" "}
              {g.average_views === null ? "—" : g.average_views.toFixed(1)} ·
              平均互动{" "}
              {g.average_interactions === null
                ? "—"
                : g.average_interactions.toFixed(1)}{" "}
              · 互动/阅读{" "}
              {g.interaction_rate === null
                ? "—"
                : (g.interaction_rate * 100).toFixed(1) + "%"}
            </p>
            <p className="help">
              实际观察时长：
              {g.observation_ages_hours
                .map((age) => age.toFixed(1) + "h")
                .join("、") || "暂无"}
            </p>
            {g.sample_count < 2 && (
              <p className="help">样本不足，仅记录现象。</p>
            )}
          </div>
        ))}
        {review && (
          <>
            <h4>数据观察</h4>
            {review.observations.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            <h4>下一步尝试</h4>
            {review.ideas.map((idea, i) => (
              <div className="card stack" key={i}>
                <strong>{idea.title}</strong>
                <p className="help">{idea.reason}</p>
                <p className="help">
                  依据 {idea.post_ids.length} 篇发布记录 · 规则生成，需人工判断
                </p>
                <Link
                  className="btn"
                  to="/drafts/new"
                  state={{
                    seedScope: reviewScope,
                    seed: {
                      title: idea.title,
                      content: "",
                      image_ids: [],
                      status: "idea",
                      context: {
                        ...emptyContext(),
                        brief: {
                          ...emptyContext().brief,
                          goal: "根据复盘继续探索",
                          evidence: idea.reason.slice(0, 600),
                        },
                      },
                    },
                  }}
                >
                  转为新选题
                </Link>
              </div>
            ))}
            {review.limitations.map((text, i) => (
              <p className="help" key={i}>
                {text}
              </p>
            ))}
          </>
        )}
      </div>
      {busy && <p role="status">正在处理复盘数据…</p>}
      {message && <p role="status">{message}</p>}
      <ErrorNotice error={error} />
    </section>
  );
}
