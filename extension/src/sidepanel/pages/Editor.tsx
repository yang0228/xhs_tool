import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ImageRecord, PaginatedResponse } from "../../shared/types";
import { apiGet, apiPost, apiPostStream } from "../lib/api";
import type { DraftDocument } from "../lib/drafts";
import { useDraftEditor } from "../hooks/useDraftEditor";
import { useAppStore } from "../stores/appStore";
import { ErrorNotice } from "../components/UI";

export default function Editor() {
  const { id = "new" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const seed = (location.state as { seed?: DraftDocument } | null)?.seed;
  const editor = useDraftEditor(id, seed);
  const { doc, setDoc, ready, status, error } = editor;
  const [aiBusy, setAiBusy] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<DraftDocument | null>(null);
  const [preview, setPreview] = useState(false);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePage, setImagePage] = useState(1);
  const [imageTotal, setImageTotal] = useState(0);
  const [showImages, setShowImages] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const addToast = useAppStore((s) => s.addToast);
  useEffect(() => {
    if (id === "new" && editor.recordId)
      navigate("/drafts/" + editor.recordId, { replace: true });
  }, [id, editor.recordId, navigate]);
  useEffect(() => {
    abort.current?.abort();
    abort.current = null;
    setAiBusy("");
    setSuggestion("");
    setTitles([]);
    setAiError(null);
    setPrevious(null);
    setPreview(false);
    return () => {
      abort.current?.abort();
      abort.current = null;
    };
  }, [id, JSON.stringify(seed)]);
  useEffect(() => {
    if (!showImages) return;
    const controller = new AbortController();
    setImageError(null);
    apiGet<PaginatedResponse<ImageRecord>>(
      "/images?page=" + imagePage + "&limit=12",
      controller.signal,
      editor.identity,
    )
      .then(async (data) => {
        setImages(data.items);
        setImageTotal(data.total);
        const entries = await Promise.all(
          data.items.map(async (img) => {
            try {
              const signed = await apiGet<{ download_url: string }>(
                "/images/" + img.id + "/download-url",
                controller.signal,
                editor.identity,
              );
              return [img.id, signed.download_url] as const;
            } catch (e) {
              if (!controller.signal.aborted)
                setImageError(e instanceof Error ? e.message : "图片预览失败");
              return [img.id, ""] as const;
            }
          }),
        );
        if (!controller.signal.aborted)
          setImageUrls(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setImageError(e.message);
      });
    return () => controller.abort();
  }, [showImages, imagePage]);
  const action = async (kind: string) => {
    if (!doc.content.trim()) {
      addToast("请先输入内容", "error");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setAiBusy(kind);
    setAiError(null);
    setSuggestion("");
    setTitles([]);
    try {
      if (kind === "titles") {
        const result = await apiPost<{ titles: string[] }>(
          "/ai/generate-titles",
          { content: doc.content, count: 3 },
          controller.signal,
          editor.identity,
        );
        if (!controller.signal.aborted) setTitles(result.titles);
      } else if (kind === "rewrite") {
        await apiPostStream(
          "/ai/rewrite",
          {
            content: doc.content,
            style: "自然、真诚的小红书分享",
            instruction: "保留事实，不编造亲身经历。",
          },
          (chunk) => {
            if (!controller.signal.aborted) setSuggestion((s) => s + chunk);
          },
          controller.signal,
          editor.identity,
        );
      } else {
        const result = await apiPost<{ polished: string }>(
          "/ai/polish",
          { content: doc.content },
          controller.signal,
          editor.identity,
        );
        if (!controller.signal.aborted) setSuggestion(result.polished);
      }
    } catch (e) {
      if (abort.current !== controller) return;
      setAiError(
        controller.signal.aborted
          ? "已停止生成，已有建议保留。"
          : e instanceof Error
            ? e.message
            : "AI 请求失败",
      );
    } finally {
      if (abort.current === controller) setAiBusy("");
    }
  };
  const apply = (next: DraftDocument) => {
    setPrevious(doc);
    setDoc(next);
    setSuggestion("");
    setTitles([]);
  };
  const toggleImage = (imageId: string) =>
    setDoc({
      ...doc,
      image_ids: doc.image_ids.includes(imageId)
        ? doc.image_ids.filter((i) => i !== imageId)
        : [...doc.image_ids, imageId],
    });
  const moveImage = (index: number, direction: number) => {
    const ids = [...doc.image_ids];
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setDoc({ ...doc, image_ids: ids });
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CREATE / 创作</p>
          <h2>{id === "new" && !editor.recordId ? "新建草稿" : "编辑草稿"}</h2>
        </div>
        <Link className="text-button" to="/drafts">
          全部草稿
        </Link>
      </div>
      <p className="muted">把灵感写下来，AI 帮你打磨表达。</p>
      <ErrorNotice error={error} />
      {error?.includes("冲突") && !editor.recoveryConflict && (
        <button
          className="btn"
          onClick={async () => {
            const copyId = await editor.recoverAsCopy();
            if (copyId) navigate("/drafts/" + copyId);
          }}
        >
          将本机修改另存为新草稿
        </button>
      )}
      {editor.recoveryConflict && (
        <div className="notice">
          检测到另一份本机修改，已保留。
          <button
            className="text-button"
            onClick={async () => {
              const copyId = await editor.recoverAsCopy();
              if (copyId) navigate("/drafts/" + copyId);
            }}
          >
            恢复为新草稿
          </button>
          <button
            className="text-button"
            onClick={() => void editor.useServerVersion()}
          >
            放弃本机旧修改
          </button>
        </div>
      )}
      {!ready ? (
        <div className="loading">{status}</div>
      ) : (
        <fieldset
          className="stack"
          style={{ border: 0, padding: 0, minWidth: 0 }}
          disabled={!!editor.recoveryConflict}
        >
          <div className="row between">
            <span
              className={"badge " + (status === "已保存" ? "green" : "")}
              role="status"
            >
              {status}
            </span>
            <button
              className="text-button"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "返回编辑" : "预览笔记"}
            </button>
          </div>
          {preview ? (
            <div className="card">
              <h3>{doc.title || "未命名笔记"}</h3>
              <div className="divider" />
              <p className="note-preview">{doc.content || "写点什么吧…"}</p>
              <p className="help">
                已选择 {doc.image_ids.length} 张配图，可在发布准备中预览。
              </p>
            </div>
          ) : (
            <div className="card stack">
              <label className="field-label" htmlFor="draft-title">
                标题
              </label>
              <input
                id="draft-title"
                className="field"
                placeholder="给这篇笔记起个标题"
                value={doc.title}
                onChange={(e) => setDoc({ ...doc, title: e.target.value })}
              />
              <label className="field-label" htmlFor="draft-content">
                正文
              </label>
              <textarea
                id="draft-content"
                className="field editor-body"
                placeholder="开始写作… 或从素材库带入灵感"
                value={doc.content}
                onChange={(e) => setDoc({ ...doc, content: e.target.value })}
              />
              <p className="help">
                标题 {Array.from(doc.title).length} 字 · 正文{" "}
                {Array.from(doc.content).length}{" "}
                字。内容完整保存，发布前按平台要求检查。
              </p>
            </div>
          )}
          <div className="card stack">
            <div className="row between">
              <h3>AI 写作助手</h3>
              <span className="badge">由你决定采用</span>
            </div>
            <p className="help">操作时，当前正文会发送给已配置的 AI 服务。</p>
            <div className="row">
              <button
                className="btn"
                disabled={!!aiBusy}
                onClick={() => action("titles")}
              >
                AI 生成标题
              </button>
              <button
                className="btn"
                disabled={!!aiBusy}
                onClick={() => action("rewrite")}
              >
                AI 改写
              </button>
              <button
                className="btn"
                disabled={!!aiBusy}
                onClick={() => action("polish")}
              >
                AI 润色
              </button>
            </div>
            {aiBusy && (
              <div className="row between">
                <span className="muted">正在生成建议…</span>
                <button
                  className="text-button"
                  onClick={() => abort.current?.abort()}
                >
                  停止生成
                </button>
              </div>
            )}
            <ErrorNotice error={aiError} />
            {titles.map((title, index) => (
              <button
                className="btn"
                key={index}
                onClick={() => apply({ ...doc, title })}
              >
                {title}
              </button>
            ))}
            {suggestion && (
              <div className="card suggestion stack">
                <p className="suggestion-output">{suggestion}</p>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    disabled={!!aiBusy}
                    onClick={() => apply({ ...doc, content: suggestion })}
                  >
                    采用建议
                  </button>
                  <button
                    className="text-button"
                    disabled={!!aiBusy}
                    onClick={() => setSuggestion("")}
                  >
                    放弃
                  </button>
                </div>
              </div>
            )}
            {previous && (
              <button
                className="text-button"
                onClick={() => {
                  setDoc(previous);
                  setPrevious(null);
                }}
              >
                撤销 AI 修改
              </button>
            )}
          </div>
          <div className="card stack">
            <div className="row between">
              <h3>配图 · {doc.image_ids.length} 张</h3>
              <button
                className="text-button"
                onClick={() => setShowImages(!showImages)}
              >
                {showImages ? "收起图片库" : "选择配图"}
              </button>
            </div>
            {doc.image_ids.map((imageId, index) => (
              <div className="row between" key={imageId}>
                <span className="muted">
                  配图 {index + 1}
                  {index === 0 ? " · 封面" : ""}
                </span>
                <div className="row">
                  <button
                    className="icon-button"
                    aria-label={"上移配图 " + (index + 1)}
                    disabled={!index}
                    onClick={() => moveImage(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"下移配图 " + (index + 1)}
                    disabled={index === doc.image_ids.length - 1}
                    onClick={() => moveImage(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="text-button"
                    onClick={() => toggleImage(imageId)}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
            {showImages && (
              <>
                <ErrorNotice error={imageError} />
                <div className="image-grid">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      className={
                        "image-tile " +
                        (doc.image_ids.includes(img.id) ? "selected" : "")
                      }
                      aria-label={
                        "选择图片 " + (img.original_filename || img.id)
                      }
                      aria-pressed={doc.image_ids.includes(img.id)}
                      onClick={() => toggleImage(img.id)}
                    >
                      {imageUrls[img.id] ? (
                        <img
                          src={imageUrls[img.id]}
                          alt={img.original_filename || "配图"}
                        />
                      ) : (
                        <span className="muted">预览加载中</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="pagination">
                  <button
                    className="btn"
                    disabled={imagePage === 1}
                    onClick={() => setImagePage((p) => p - 1)}
                  >
                    上一页
                  </button>
                  <Link className="text-button" to="/images">
                    上传图片
                  </Link>
                  <button
                    className="btn"
                    disabled={imagePage * 12 >= imageTotal}
                    onClick={() => setImagePage((p) => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="editor-actions">
            <button className="btn" onClick={() => void editor.save()}>
              保存草稿
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                const savedId = await editor.save();
                if (savedId) {
                  await editor.discardNewCache();
                  navigate("/publish?draft=" + savedId);
                }
              }}
            >
              准备发布 →
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
