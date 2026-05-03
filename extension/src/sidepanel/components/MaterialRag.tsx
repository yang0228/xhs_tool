import { useEffect, useRef, useState } from "react";
import type { Material } from "../../shared/types";
import { apiDelete, apiGet, type ApiIdentity } from "../lib/api";
import { readSettings } from "../lib/settings";
import { syncMaterial } from "../lib/rag";
import { ErrorNotice } from "./UI";

export default function MaterialRag({
  material,
  unreadable,
  identity: origin,
}: {
  material: Material;
  unreadable?: boolean;
  identity?: ApiIdentity;
}) {
  const [status, setStatus] = useState("尚未查询"),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const controller = useRef(new AbortController());
  useEffect(() => () => controller.current.abort(), []);
  const run = async (kind: "status" | "sync" | "remove") => {
    setBusy(true);
    setError(null);
    try {
      const identity = origin ?? (await readSettings());
      if (kind === "remove") {
        await apiDelete(
          "/materials/" + material.id + "/rag",
          controller.current.signal,
          identity,
        );
        if (!controller.current.signal.aborted)
          setStatus("已撤销；远端清理状态可再查询");
      } else {
        const result =
          kind === "sync"
            ? await syncMaterial(material, identity, controller.current.signal)
            : await apiGet<{ status: string; last_error?: string }>(
                "/materials/" + material.id + "/rag",
                controller.current.signal,
                identity,
              );
        if (!controller.current.signal.aborted) {
          setStatus(result.status);
          if (result.last_error) setError(result.last_error);
        }
      }
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "索引操作失败");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    if (!open || busy || status !== "processing") return;
    const timer = setTimeout(() => void run("status"), 3000);
    return () => clearTimeout(timer);
  }, [open, busy, status]);
  const label =
    (
      {
        unindexed: "未建索引",
        processing: "解析中",
        ready: "可检索",
        failed: "处理失败",
        outdated: "需要更新",
        disabled: "服务未配置",
        cleanup_pending: "远端清理未完成",
        removed: "已撤销",
      } as Record<string, string>
    )[status] ?? status;
  return (
    <details
      onToggle={(e) => {
        const expanded = e.currentTarget.open;
        setOpen(expanded);
        if (expanded && status === "尚未查询") void run("status");
      }}
    >
      <summary>知识库索引 · {label}</summary>
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run("status")}
        >
          查看索引状态
        </button>
        <button
          className="btn"
          disabled={busy || unreadable}
          onClick={() => void run("sync")}
        >
          建立或重试索引
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void run("remove")}
        >
          撤销索引
        </button>
      </div>
      <ErrorNotice error={error} />
    </details>
  );
}
