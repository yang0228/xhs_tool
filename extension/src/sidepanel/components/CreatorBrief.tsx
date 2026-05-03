import { useEffect, useRef, useState } from "react";
import type { EncryptedPayload } from "../../shared/types";
import { apiGet, type ApiIdentity } from "../lib/api";
import { decryptContent } from "../lib/crypto";
import {
  draftStatuses,
  emptyContext,
  parseProfile,
  type Brief,
} from "../lib/creator";
import type { DraftDocument } from "../lib/drafts";
import { readSettings } from "../lib/settings";
import TagInput from "./TagInput";
import { ErrorNotice } from "./UI";

export default function CreatorBrief({
  doc,
  onChange,
  identity,
}: {
  doc: DraftDocument;
  onChange: (
    doc: DraftDocument | ((current: DraftDocument) => DraftDocument),
  ) => void;
  identity?: ApiIdentity;
}) {
  const context = doc.context ?? emptyContext();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef(new AbortController());
  useEffect(() => () => controller.current.abort(), []);
  const loadStyle = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiGet<{
        encrypted_profile: EncryptedPayload | null;
      }>("/profile", controller.current.signal, identity);
      if (!result.encrypted_profile)
        throw new Error("请先在设置中填写并保存个人创作档案");
      const profile = parseProfile(
        JSON.parse(await decryptContent(result.encrypted_profile)),
      );
      const current = await readSettings();
      if (
        controller.current.signal.aborted ||
        (identity &&
          (current.apiKey !== identity.apiKey ||
            current.backendUrl !== identity.backendUrl))
      )
        return;
      onChange((current) => ({
        ...current,
        context: { ...(current.context ?? emptyContext()), profile },
      }));
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "档案读取失败");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="card stack">
      <h3>选题与创作简报</h3>
      <div className="form-grid">
        <label>
          创作状态
          <select
            aria-label="创作状态"
            className="field"
            value={doc.status ?? "draft"}
            onChange={(e) =>
              onChange({
                ...doc,
                status: e.target.value as DraftDocument["status"],
              })
            }
          >
            {Object.entries(draftStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          计划日期
          <input
            type="date"
            className="field"
            value={doc.planned_date ?? ""}
            onChange={(e) =>
              onChange({ ...doc, planned_date: e.target.value || null })
            }
          />
        </label>
      </div>
      <label>
        主题标签
        <TagInput
          tags={doc.topic_tags ?? []}
          onChange={(tags) => onChange({ ...doc, topic_tags: tags })}
        />
      </label>
      <details>
        <summary>填写单篇简报</summary>
        <div className="stack">
          {(
            [
              ["goal", "本篇目标"],
              ["audience", "目标读者"],
              ["angle", "核心观点"],
              ["evidence", "事实依据"],
              ["cta", "读者行动"],
            ] as [keyof Brief, string][]
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                className="field"
                maxLength={600}
                value={context.brief[key]}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    context: {
                      ...context,
                      brief: { ...context.brief, [key]: e.target.value },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void loadStyle()}
        >
          使用个人风格
        </button>
        {context.profile && (
          <button
            className="text-button"
            onClick={() =>
              onChange({ ...doc, context: { ...context, profile: undefined } })
            }
          >
            移除风格
          </button>
        )}
      </div>
      {context.profile && (
        <p className="help">
          已采用风格快照：
          {context.profile.position || context.profile.tone || "个人档案"}
          。更新档案后需重新选用。
        </p>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}
