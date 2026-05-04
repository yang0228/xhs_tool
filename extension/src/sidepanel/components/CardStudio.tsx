import { useEffect, useRef, useState } from "react";
import {
  cardSourceSignature,
  downloadBlob,
  paginateCards,
  renderCards,
  type CardDesign,
  type CardPage,
  MAX_CARD_PAGES,
} from "../lib/cards";
import type { ApiIdentity } from "../lib/api";
import { ErrorNotice } from "./UI";

export type CardStudioProps = {
  title: string;
  content: string;
  imageIds: string[];
  value?: CardDesign;
  onChange: (value: CardDesign) => void;
  identity?: ApiIdentity;
};

export default function CardStudio({
  title,
  content,
  imageIds,
  value,
  onChange,
  identity,
}: CardStudioProps) {
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ blobs: Blob[]; urls: string[] }>();
  const operation = useRef(0);
  useEffect(() => {
    let active = true;
    setSignature("");
    cardSourceSignature(title, content)
      .then((hash) => {
        if (active) setSignature(hash);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "无法检查卡片版本");
      });
    return () => {
      active = false;
    };
  }, [title, content]);
  useEffect(() => {
    operation.current++;
    setPreview(undefined);
    setBusy(false);
    setError(null);
    return () => {
      operation.current++;
    };
  }, [value, identity?.backendUrl, identity?.apiKey]);
  useEffect(
    () => () => {
      preview?.urls.forEach((url) => URL.revokeObjectURL(url));
    },
    [preview],
  );

  const generate = async () => {
    const current = ++operation.current;
    setBusy(true);
    setError(null);
    try {
      await document.fonts.ready;
      const hash = await cardSourceSignature(title, content);
      const pages = paginateCards(title, content);
      if (current === operation.current)
        onChange({
          template: value?.template || "checklist",
          palette: value?.palette || "rose",
          pages,
          source_signature: hash,
        });
    } catch (e) {
      if (current === operation.current)
        setError(e instanceof Error ? e.message : "生成卡片失败");
    } finally {
      if (current === operation.current) setBusy(false);
    }
  };
  const showPreview = async () => {
    if (!value) return;
    const current = ++operation.current;
    setBusy(true);
    setError(null);
    try {
      const blobs = await renderCards(value, identity);
      if (current === operation.current)
        setPreview({
          blobs,
          urls: blobs.map((blob) => URL.createObjectURL(blob)),
        });
    } catch (e) {
      if (current === operation.current)
        setError(e instanceof Error ? e.message : "卡片预览失败");
    } finally {
      if (current === operation.current) setBusy(false);
    }
  };
  const updatePage = (index: number, patch: Partial<CardPage>) => {
    if (value)
      onChange({
        ...value,
        pages: value.pages.map((p, i) =>
          i === index ? { ...p, ...patch } : p,
        ),
      });
  };
  const move = (index: number, offset: number) => {
    if (!value) return;
    const pages = [...value.pages];
    [pages[index], pages[index + offset]] = [
      pages[index + offset],
      pages[index],
    ];
    onChange({ ...value, pages });
  };
  const split = (index: number) => {
    if (!value) return;
    if (value.pages.length >= MAX_CARD_PAGES) return;
    const page = value.pages[index];
    const clusters = Array.from(
      new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(page.body),
      (s) => s.segment,
    );
    if (clusters.length < 2) return;
    const paragraph = page.body.indexOf("\n\n");
    const at =
      paragraph >= 0 && paragraph + 2 < page.body.length
        ? paragraph + 2
        : clusters.slice(0, Math.ceil(clusters.length / 2)).join("").length;
    onChange({
      ...value,
      pages: [
        ...value.pages.slice(0, index),
        { ...page, body: page.body.slice(0, at) },
        { title: page.title + "（续）", body: page.body.slice(at) },
        ...value.pages.slice(index + 1),
      ],
    });
  };

  return (
    <section className="card stack" aria-label="图文卡片工作台">
      <div className="row between">
        <h3>图文卡片</h3>
        <span className="badge">1080 × 1440</span>
      </div>
      <p className="muted">
        先生成分页，再调整每页文字。添加配图后可拆页腾出空间；预览通过后即可逐张下载
        PNG。
      </p>
      <p className="help">
        每篇最多 100 页；达到上限后请拆成多篇，原文会完整保留。
      </p>
      {value && signature && value.source_signature !== signature && (
        <div className="notice">
          正文或标题已变化。现有卡片保留人工修改，请核对或重新生成。
          <button
            className="btn"
            disabled={busy}
            onClick={() => onChange({ ...value, source_signature: signature })}
          >
            保留卡片并确认已核对
          </button>
        </div>
      )}
      <ErrorNotice error={error} />
      <fieldset
        disabled={busy}
        className="stack"
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => void generate()}>
            从当前标题和正文生成
          </button>
          {value && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => void showPreview()}
            >
              生成预览
            </button>
          )}
        </div>
        {value && (
          <>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label>
                卡片模板
                <select
                  className="field"
                  aria-label="卡片模板"
                  value={value.template}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      template: e.target.value as CardDesign["template"],
                    })
                  }
                >
                  <option value="checklist">清单</option>
                  <option value="steps">步骤</option>
                </select>
              </label>
              <label>
                卡片配色
                <select
                  className="field"
                  aria-label="卡片配色"
                  value={value.palette}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      palette: e.target.value as CardDesign["palette"],
                    })
                  }
                >
                  <option value="rose">暖玫瑰</option>
                  <option value="ink">墨蓝</option>
                  <option value="sage">鼠尾草</option>
                </select>
              </label>
            </div>
            {value.pages.map((page, index) => (
              <div className="card stack" key={index}>
                <div className="row between">
                  <strong>{index === 0 ? "封面" : `第 ${index + 1} 页`}</strong>
                  <div className="row">
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`第 ${index + 1} 页上移`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`第 ${index + 1} 页下移`}
                      disabled={index === value.pages.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      下移
                    </button>
                  </div>
                </div>
                <label>
                  标题
                  <input
                    className="field"
                    aria-label={`第 ${index + 1} 页标题`}
                    value={page.title}
                    onChange={(e) =>
                      updatePage(index, { title: e.target.value })
                    }
                  />
                </label>
                <label>
                  正文
                  <textarea
                    className="field"
                    rows={5}
                    aria-label={`第 ${index + 1} 页正文`}
                    value={page.body}
                    onChange={(e) =>
                      updatePage(index, { body: e.target.value })
                    }
                  />
                </label>
                <label>
                  配图
                  <select
                    className="field"
                    aria-label={`第 ${index + 1} 页配图`}
                    value={page.image_id || ""}
                    onChange={(e) =>
                      updatePage(index, {
                        image_id: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">无配图</option>
                    {page.image_id && !imageIds.includes(page.image_id) && (
                      <option value={page.image_id}>
                        配图已不在当前选择，请核对或移除
                      </option>
                    )}
                    {imageIds.map((id, i) => (
                      <option key={id} value={id}>
                        已选图片 {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row between">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`拆分第 ${index + 1} 页`}
                    disabled={
                      value.pages.length >= MAX_CARD_PAGES ||
                      Array.from(page.body).length < 2
                    }
                    onClick={() => split(index)}
                  >
                    拆为两页
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`删除第 ${index + 1} 页`}
                    disabled={value.pages.length === 1}
                    onClick={() =>
                      onChange({
                        ...value,
                        pages: value.pages.filter((_, i) => i !== index),
                      })
                    }
                  >
                    删除此页
                  </button>
                </div>
                {preview && (
                  <>
                    <img
                      src={preview.urls[index]}
                      alt={`第 ${index + 1} 页卡片预览`}
                      style={{
                        width: "100%",
                        maxWidth: 360,
                        height: "auto",
                        borderRadius: 12,
                      }}
                    />
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        downloadBlob(
                          preview.blobs[index],
                          `${String(index + 1).padStart(2, "0")}.png`,
                        )
                      }
                    >
                      下载第 {index + 1} 页 PNG
                    </button>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </fieldset>
      {busy && (
        <p role="status" className="muted">
          正在处理卡片…
        </p>
      )}
    </section>
  );
}
