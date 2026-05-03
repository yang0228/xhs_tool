import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { readSettings } from "../lib/settings";
import { readRagConsent, saveRagConsent } from "../lib/rag";
import { ErrorNotice } from "./UI";

export default function RagSettings() {
  const [consent, setConsent] = useState<boolean | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void readRagConsent()
      .then((v) => {
        if (active) setConsent(v);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="card stack">
      <h3>素材知识库 · RAG</h3>
      <p className="help">
        启用后，新素材会在保存后同步；旧素材可在素材库选择并补建索引。正文解密后发送给自托管后端和所配置的
        RAGFlow，后端不会获得本地密钥。远端模型若使用外部服务，文本也会发送给该模型提供方，请先核对后端配置。
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={consent ?? false}
          disabled={busy || consent === null}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            setError(null);
            setConsent(next);
            try {
              await saveRagConsent(next);
            } catch (reason) {
              setConsent(!next);
              setError(String(reason));
            } finally {
              setBusy(false);
            }
          }}
        />
        允许 RAG 保存所选素材的明文副本
      </label>
      <p className="help">
        关闭后停止新增同步；已存在的副本需在素材库撤销索引并确认清理。
      </p>
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const identity = await readSettings();
              const result = await apiGet<{
                configured: boolean;
                enabled: boolean;
                message: string;
              }>("/rag/status", undefined, identity);
              setStatus(result.message);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "检查失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          检查知识库连接
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const result = await apiPost<{ remaining: number }>(
                "/rag/cleanup",
              );
              setStatus(
                result.remaining
                  ? `仍有 ${result.remaining} 份远端副本待清理，请稍后重试`
                  : "待清理的远端副本已处理",
              );
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "清理失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          重试远端清理
        </button>
      </div>
      {status && <p role="status">{status}</p>}
      <ErrorNotice error={error} />
    </section>
  );
}
