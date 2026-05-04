import { useEffect, useRef, useState } from "react";
import type { PublishedPost } from "../../shared/types";
import type { DraftDocument } from "../lib/drafts";
import { decodePublicationSnapshot } from "../lib/publication";
import { downloadImage, renderCards } from "../lib/cards";
import { assertIdentity, type ApiIdentity } from "../lib/api";
import { ErrorNotice } from "./UI";

export default function PublicationSnapshot({
  post,
  identity,
}: {
  post: PublishedPost;
  identity: ApiIdentity;
}) {
  const [doc, setDoc] = useState<DraftDocument | null>(null),
    [error, setError] = useState<string | null>(null),
    [urls, setUrls] = useState<string[]>([]),
    [originals, setOriginals] = useState<{ url: string; extension: string }[]>(
      [],
    ),
    [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () => () => urls.forEach((url) => URL.revokeObjectURL(url)),
    [urls],
  );
  useEffect(
    () => () => originals.forEach(({ url }) => URL.revokeObjectURL(url)),
    [originals],
  );
  return (
    <div className="stack">
      <button
        className="text-button"
        disabled={busy || !post.snapshot}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await assertIdentity(identity);
            const snapshot = await decodePublicationSnapshot(post);
            if (active.current) setDoc(snapshot);
          } catch (e) {
            if (active.current)
              setError(e instanceof Error ? e.message : "快照读取失败");
          } finally {
            if (active.current) setBusy(false);
          }
        }}
      >
        {post.snapshot ? "查看发布快照" : "旧记录未保存内容快照"}
      </button>
      <ErrorNotice error={error} />
      {doc && (
        <div className="card stack">
          <div className="row between">
            <h3>{doc.title}</h3>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDoc(null);
                setUrls([]);
                setOriginals([]);
              }}
            >
              收起快照
            </button>
          </div>
          <p className="help">
            发布时草稿 v{post.draft_version ?? "—"} ·{" "}
            {(post.topic_tags ?? []).join(" · ")}
          </p>
          <p className="note-preview">{doc.content}</p>
          {!!doc.context?.references.length && (
            <details>
              <summary>发布时素材依据</summary>
              {doc.context.references.map((r, i) => (
                <div key={r.id + i}>
                  <strong>
                    [{i + 1}] {r.title}
                  </strong>
                  <p className="preview-text">{r.content}</p>
                </div>
              ))}
            </details>
          )}
          {doc.context?.cards && (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await assertIdentity(identity);
                  const blobs = await renderCards(
                    doc.context!.cards!,
                    identity,
                  );
                  await assertIdentity(identity);
                  if (active.current)
                    setUrls(blobs.map((blob) => URL.createObjectURL(blob)));
                } catch (e) {
                  if (active.current)
                    setError(
                      e instanceof Error ? e.message : "历史图片预览失败",
                    );
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              预览历史图文
            </button>
          )}
          {urls.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={"发布时图文 " + (i + 1)}
              style={{ width: "100%", maxWidth: 360 }}
            />
          ))}
          {!!doc.image_ids.length && (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const blobs: Blob[] = [];
                  let remaining = 100 * 1024 * 1024;
                  for (const id of doc.image_ids) {
                    const blob = await downloadImage(id, identity, remaining);
                    blobs.push(blob);
                    remaining -= blob.size;
                  }
                  await assertIdentity(identity);
                  if (active.current)
                    setOriginals(
                      blobs.map((blob) => ({
                        url: URL.createObjectURL(blob),
                        extension: blob.type
                          .split("/")[1]
                          .replace("jpeg", "jpg"),
                      })),
                    );
                } catch (e) {
                  if (active.current)
                    setError(
                      e instanceof Error ? e.message : "发布原图读取失败",
                    );
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              查看发布原图
            </button>
          )}
          {originals.map(({ url, extension }, i) => (
            <div className="stack" key={url}>
              <img
                src={url}
                alt={"发布原图 " + (i + 1)}
                style={{ width: "100%", maxWidth: 360 }}
              />
              <a
                className="text-button"
                href={url}
                download={`original-${String(i + 1).padStart(2, "0")}.${extension}`}
              >
                下载原图 {i + 1}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
