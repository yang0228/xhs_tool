import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ImageRecord, PaginatedResponse } from "../../shared/types";
import { apiDelete, apiGet, apiPost, type ApiIdentity } from "../lib/api";
import { readSettings } from "../lib/settings";
import { EmptyState, ErrorNotice } from "../components/UI";

const LIMIT = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "请求失败，请重试";

function ImagePreview({
  image,
  identity,
}: {
  image: ImageRecord;
  identity: ApiIdentity;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUrl("");
    setError(null);
    apiGet<{ download_url: string }>(
      `/images/${image.id}/download-url`,
      controller.signal,
      identity,
    )
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.download_url);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      });
    return () => controller.abort();
  }, [image.id, identity, revision]);
  return (
    <>
      {url && !error ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={"打开图片 " + (image.original_filename || "")}
        >
          <img
            src={url}
            alt={image.original_filename || "图片素材"}
            loading="lazy"
            onError={() => setError("图片加载失败，链接可能已过期。")}
          />
        </a>
      ) : (
        !error && <p className="muted">加载预览…</p>
      )}
      <ErrorNotice error={error} retry={() => setRevision((v) => v + 1)} />
      {url && !error && (
        <a
          className="text-button"
          href={url}
          download={image.original_filename || "image"}
          target="_blank"
          rel="noreferrer"
        >
          打开 / 下载 ↗
        </a>
      )}
    </>
  );
}

export default function Images() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const operations = useRef(new Set<AbortController>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operations.current.forEach((c) => c.abort());
      operations.current.clear();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDeleting(null);
    void (async () => {
      try {
        const account = await readSettings();
        const data = await apiGet<PaginatedResponse<ImageRecord>>(
          `/images?page=${page}&limit=${LIMIT}`,
          controller.signal,
          account,
        );
        if (!controller.signal.aborted) {
          setImages(data.items);
          setTotal(data.total);
          setIdentity(account);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [page, revision]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setError(null);
    setStatus("");
    if (!accepted.includes(file.type)) {
      setError("请选择 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    if (!file.size || file.size > MAX_BYTES) {
      setError("图片须大于 0 字节且不超过 20 MB。");
      return;
    }
    const controller = new AbortController();
    operations.current.add(controller);
    const timer = setTimeout(
      () => controller.abort(new Error("上传超时，请重试")),
      120_000,
    );
    setUploading(true);
    try {
      const account = await readSettings();
      let dimensions: { width?: number; height?: number } = {};
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      }
      controller.signal.throwIfAborted();
      setStatus("正在上传图片…");
      const signed = await apiPost<{ upload_url: string; r2_key: string }>(
        "/images/upload-url",
        { filename: file.name, mime_type: file.type, file_size: file.size },
        controller.signal,
        account,
      );
      const response = await fetch(signed.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`图片上传失败 (${response.status})，请重试。`);
      controller.signal.throwIfAborted();
      setStatus("正在确认图片…");
      await apiPost(
        "/images/confirm",
        { r2_key: signed.r2_key, ...dimensions },
        controller.signal,
        account,
      );
      if (mounted.current) {
        setStatus("图片上传成功");
        if (page !== 1) setPage(1);
        else setRevision((v) => v + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setError(
          message(controller.signal.aborted ? controller.signal.reason : error),
        );
        setStatus("");
      }
    } finally {
      clearTimeout(timer);
      operations.current.delete(controller);
      if (mounted.current) setUploading(false);
    }
  };

  const remove = async (image: ImageRecord) => {
    if (!identity || busy) return;
    const controller = new AbortController();
    operations.current.add(controller);
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      await apiDelete("/images/" + image.id, controller.signal, identity);
      if (mounted.current) {
        setDeleting(null);
        setStatus("图片已删除");
        if (images.length === 1 && page > 1) setPage((p) => p - 1);
        else setRevision((v) => v + 1);
      }
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      operations.current.delete(controller);
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIBRARY / 灵感库</p>
          <h2>图片库</h2>
        </div>
      </div>
      <div className="tabs">
        <Link to="/materials">文字素材</Link>
        <Link className="active" to="/images">
          图片素材
        </Link>
      </div>
      <div className="card stack">
        <input
          ref={fileRef}
          type="file"
          accept={accepted.join(",")}
          aria-label="选择上传图片"
          onChange={upload}
          hidden
        />
        <button
          className="btn btn-primary"
          disabled={uploading || busy}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "上传中…" : "＋ 上传图片"}
        </button>
        <p className="help">
          支持 PNG、JPEG、WebP、GIF，每张不超过 20 MB。上传后可在创作中选用。
        </p>
        {status && (
          <p className="muted" role="status">
            {status}
          </p>
        )}
      </div>
      <ErrorNotice error={error} />
      {loading ? (
        <div className="loading">加载中...</div>
      ) : images.length ? (
        <div className="image-grid">
          {images.map((image) => (
            <article className="card image-tile stack" key={image.id}>
              {identity && <ImagePreview image={image} identity={identity} />}
              <span className="material-title">
                {image.original_filename || "未命名图片"}
              </span>
              <p className="help">
                {image.width && image.height
                  ? `${image.width} × ${image.height} · `
                  : ""}
                {image.file_size_bytes
                  ? `${Math.ceil(image.file_size_bytes / 1024)} KB`
                  : image.mime_type}
              </p>
              <button
                className="text-button"
                disabled={busy || uploading}
                onClick={() => setDeleting(image.id)}
              >
                删除
              </button>
              {deleting === image.id && (
                <div className="notice">
                  确认删除这张图片？使用它的草稿将无法显示图片。
                  <div className="row">
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => remove(image)}
                    >
                      确认删除
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
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
      ) : (
        !error && (
          <EmptyState
            title="暂无图片"
            detail="上传图片，为下一篇笔记准备配图。"
          />
        )
      )}
      {error && (
        <button
          className="btn"
          disabled={uploading || busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          重新加载列表
        </button>
      )}
      <div className="pagination">
        <button
          className="btn"
          disabled={page === 1 || loading || busy || uploading}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>
          第 {page} 页 · 共 {total} 张
        </span>
        <button
          className="btn"
          disabled={page * LIMIT >= total || loading || busy || uploading}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
