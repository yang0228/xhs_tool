import { useEffect, useRef, useState } from "react";
import {
  apiGet,
  apiPost,
  apiPostStream,
  ApiError,
  type ApiIdentity,
} from "../lib/api";
import type { Material } from "../../shared/types";
import type { DraftDocument } from "../lib/drafts";
import type { SourceReference } from "../lib/creator";
import { ErrorNotice } from "./UI";

export default function GroundedWriter({
  doc,
  identity,
  onApply,
  onUpdateReferences,
}: {
  doc: DraftDocument;
  identity?: ApiIdentity;
  onApply: (content: string, references: SourceReference[]) => void;
  onUpdateReferences?: (
    update: (current: SourceReference[]) => SourceReference[],
  ) => void;
}) {
  const [question, setQuestion] = useState(""),
    [scoped, setScoped] = useState(false),
    [sources, setSources] = useState<SourceReference[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [lastQuery, setLastQuery] = useState(""),
    [lastScope, setLastScope] = useState(""),
    [suggestion, setSuggestion] = useState(""),
    [generatedSources, setGeneratedSources] = useState<SourceReference[]>([]);
  const [busy, setBusy] = useState(false),
    [finished, setFinished] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const query = (
    question.trim() ||
    [doc.title, doc.context?.brief.goal, doc.context?.brief.angle]
      .filter(Boolean)
      .join("\n")
  ).slice(0, 4000);
  const ids = scoped
    ? [...new Set(doc.context?.references.map((r) => r.material_id) ?? [])]
    : undefined;
  const scope = JSON.stringify(ids ?? []);
  const retrieve = async (signal: AbortSignal) => {
    if (!query) throw new Error("请先填写选题或检索问题");
    if (scoped && !ids?.length)
      throw new Error("当前没有关联素材，请从素材库带入或使用全部素材");
    const result = await apiPost<{ sources: SourceReference[] }>(
      "/rag/retrieve",
      { question: query, material_ids: ids },
      signal,
      identity,
    );
    if (!Array.isArray(result.sources)) throw new Error("知识库返回格式无效");
    if (!signal.aborted) {
      setSources(result.sources);
      setSelected(result.sources.map((r) => r.id));
      setLastQuery(query);
      setLastScope(scope);
      setMessage(
        result.sources.length
          ? "请选择本次写作采用的片段。AI 可能误引，请核对原文。"
          : "没有找到可用素材，可调整问题、检查索引，或继续普通写作。",
      );
    }
    return result.sources;
  };
  const run = async (mode?: "outline" | "body") => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setSuggestion("");
    setFinished(false);
    setMessage("");
    try {
      let chosen = sources.filter((r) => selected.includes(r.id));
      if (
        !mode ||
        query !== lastQuery ||
        scope !== lastScope ||
        !sources.length
      )
        chosen = await retrieve(controller.signal);
      if (!mode) return;
      if (!chosen.length)
        throw new Error("没有选中的有效来源，请先建立索引并检索素材");
      setGeneratedSources(structuredClone(chosen));
      await apiPostStream(
        "/ai/grounded",
        {
          question: query,
          material_ids: ids,
          mode,
          brief: JSON.stringify(doc.context?.brief ?? {}),
          style: JSON.stringify(doc.context?.profile ?? {}),
          source_ids: chosen.map((r) => r.id),
        },
        (chunk) => {
          if (!controller.signal.aborted)
            setSuggestion((previous) => previous + chunk);
        },
        controller.signal,
        identity,
        true,
      );
      if (!controller.signal.aborted) setFinished(true);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "已停止，本次建议未完成；已显示文字保留供核对。"
          : e instanceof Error
            ? e.message
            : "知识库请求失败",
      );
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };
  const verifyReferences = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    try {
      const availability = new Map<string, Material | null>();
      for (const ref of doc.context?.references ?? []) {
        if (availability.has(ref.material_id)) continue;
        try {
          availability.set(
            ref.material_id,
            await apiGet<Material>(
              "/materials/" + ref.material_id,
              controller.signal,
              identity,
            ),
          );
        } catch (e) {
          if (e instanceof ApiError && e.status === 404)
            availability.set(ref.material_id, null);
          else throw e;
        }
      }
      onUpdateReferences?.((current) =>
        current.map((ref) => {
          if (!availability.has(ref.material_id)) return ref;
          const material = availability.get(ref.material_id);
          if (!material)
            return { ...ref, availability: "missing", verified: false };
          if (material.content_hash !== ref.content_hash)
            return { ...ref, availability: "changed", verified: false };
          return { ...ref, availability: "active" };
        }),
      );
      setMessage(
        "已核对原素材是否存在及内容版本；请继续核对文字是否支持正文。",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "来源核对失败，原有引用已保留",
        );
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };
  return (
    <section className="card stack">
      <h3>用素材写作 · RAG</h3>
      <label>
        检索问题
        <input
          className="field"
          maxLength={4000}
          placeholder="留空时使用题目与简报"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={scoped}
          disabled={busy}
          onChange={(e) => setScoped(e.target.checked)}
        />
        只在当前关联素材中检索
      </label>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => void run()}>
          检索素材
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run("outline")}
        >
          生成带引用提纲
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run("body")}
        >
          生成带引用正文
        </button>
      </div>
      <p className="help">
        生成时会自动检索；简报、所选风格及引用片段会发送给已配置的 AI 服务。
      </p>
      {message && (
        <p role="status" className="help">
          {message}
        </p>
      )}
      {sources.map((source, index) => (
        <div className="card stack" key={source.id}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={selected.includes(source.id)}
              disabled={busy}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, source.id]
                    : selected.filter((id) => id !== source.id),
                )
              }
            />
            [{index + 1}] {source.title}
          </label>
          <p className="preview-text">{source.content}</p>
          {source.url && /^https?:\/\//i.test(source.url) && (
            <a
              className="text-button"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              查看来源 ↗
            </a>
          )}
        </div>
      ))}
      {busy && (
        <button className="btn" onClick={() => abort.current?.abort()}>
          停止知识库生成
        </button>
      )}
      <ErrorNotice error={error} />
      {suggestion && (
        <div className="suggestion stack">
          <p className="suggestion-output">{suggestion}</p>
          <button
            className="btn btn-primary"
            disabled={busy || !finished}
            onClick={() => {
              onApply(
                suggestion,
                generatedSources.map((r) => ({ ...r, verified: true })),
              );
              setSuggestion("");
              setFinished(false);
            }}
          >
            采用带引用建议
          </button>
        </div>
      )}
      {!!doc.context?.references.length && (
        <details>
          <summary>已保存的素材依据 · {doc.context.references.length}</summary>
          {onUpdateReferences && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void verifyReferences()}
            >
              复核已保存来源
            </button>
          )}
          {doc.context.references.map((r, index) => (
            <div className="stack" key={r.id + index}>
              <p className="help">
                [{index + 1}] {r.title} ·{" "}
                {r.verified ? "本次生成引用" : "待复核"}
              </p>
              <p className="preview-text">{r.content}</p>
              {r.availability === "missing" && (
                <p className="help">原素材已不可访问，已保留引用原文。</p>
              )}
              {r.availability === "changed" && (
                <p className="help">原素材已更新，请核对这份引用快照。</p>
              )}
              {onUpdateReferences && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    onUpdateReferences((current) =>
                      current
                        .filter((ref) => ref.id !== r.id)
                        .map((ref) => ({ ...ref, verified: false })),
                    )
                  }
                >
                  移除此来源并复核正文编号
                </button>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
