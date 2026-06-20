import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "../../shared/types";
import {
  apiGet,
  apiPost,
  apiPut,
  ApiError,
  type ApiIdentity,
} from "../lib/api";
import {
  clearRecovery,
  decodeDraft,
  encodeDraft,
  loadRecovery,
  recoveryScope,
  saveRecovery,
  type DraftDocument,
} from "../lib/drafts";
import { readSettings } from "../lib/settings";
const empty = (): DraftDocument => ({ title: "", content: "", image_ids: [] });
const signature = (doc: DraftDocument) =>
  JSON.stringify([doc.title, doc.content, doc.image_ids]);
interface Session {
  key: string;
  identity: ApiIdentity;
  scope: string;
  doc: DraftDocument;
  record: { id: string; version: number };
  saved: string;
  live: boolean;
  ready: boolean;
  busy: boolean;
  blocked: boolean;
  repeat: boolean;
  conflict: DraftDocument | null;
  copyId: string;
}
export function useDraftEditor(routeId: string, seed?: DraftDocument) {
  const [doc, setDocument] = useState<DraftDocument>(empty);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("正在读取草稿…");
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [recoveryConflict, setRecoveryConflict] =
    useState<DraftDocument | null>(null);
  const session = useRef<Session | null>(null);
  const seedKey = seed ? signature(seed) : "";
  const setDoc = useCallback((next: DraftDocument) => {
    if (!session.current?.ready || session.current.conflict) return;
    session.current.doc = next;
    setDocument(next);
  }, []);
  const isCurrent = async (s: Session) =>
    s.live && session.current === s && (await recoveryScope()) === s.scope;
  const cache = async (s: Session) => {
    if (!s.ready || s.conflict || (await recoveryScope()) !== s.scope) return;
    const snapshot = { ...s.doc, ...s.record };
    await saveRecovery(s.key, snapshot, s.scope);
    if (s.key === "new" && s.record.version)
      await saveRecovery(s.record.id, snapshot, s.scope);
  };
  useEffect(() => {
    const s: Session = {
      key: routeId,
      identity: { backendUrl: "", apiKey: "" },
      scope: "",
      doc: empty(),
      record: { id: crypto.randomUUID(), version: 0 },
      saved: "",
      live: true,
      ready: false,
      busy: false,
      blocked: false,
      repeat: false,
      conflict: null,
      copyId: crypto.randomUUID(),
    };
    session.current = s;
    setReady(false);
    setError(null);
    setRecoveryConflict(null);
    setRecordId(null);
    setStatus("正在读取草稿…");
    void (async () => {
      s.identity = await readSettings();
      s.scope = await recoveryScope(s.identity);
      const cached = await loadRecovery(s.key, s.scope);
      let server: Draft | null = null;
      if (routeId !== "new") {
        try {
          server = await apiGet<Draft>(
            "/drafts/" + routeId,
            undefined,
            s.identity,
          );
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 0) || !cached) throw e;
        }
        if (server) {
          s.doc = await decodeDraft(server);
          s.record = { id: server.id, version: server.version };
          s.saved = signature(s.doc);
        }
      }
      if (cached) {
        if (seed && signature(cached) !== signature(seed)) {
          s.conflict = cached;
          s.doc = seed;
        } else if (
          server &&
          cached.version !== server.version &&
          signature(cached) !== signature(s.doc)
        )
          s.conflict = cached;
        else {
          s.doc = {
            title: cached.title,
            content: cached.content,
            image_ids: cached.image_ids,
          };
          s.record = {
            id: cached.id || s.record.id,
            version: server?.version ?? cached.version ?? 0,
          };
        }
      } else if (routeId === "new" && seed) s.doc = seed;
      if (!(await isCurrent(s))) return;
      s.ready = true;
      setDocument(s.doc);
      setReady(true);
      setRecoveryConflict(s.conflict);
      setRecordId(s.record.version ? s.record.id : null);
      setStatus(
        s.conflict
          ? "有未合并的本机修改"
          : cached && signature(s.doc) !== s.saved
            ? "已恢复本机草稿"
            : s.record.version
              ? "已保存"
              : "未保存",
      );
    })().catch((e) => {
      if (s.live) {
        setError(e instanceof Error ? e.message : "读取失败");
        setStatus("读取失败，原始数据已保留");
      }
    });
    return () => {
      s.live = false;
      void cache(s).catch(() => {});
    };
  }, [routeId, seedKey]);

  const saveSession = async (s: Session): Promise<string | null> => {
    if (!s.ready || s.blocked || s.conflict || !s.live) return null;
    if (s.busy) {
      s.repeat = true;
      return null;
    }
    const snapshot = { ...s.doc, image_ids: [...s.doc.image_ids] };
    const identity = { ...s.record };
    if (!snapshot.title.trim() || !snapshot.content.trim()) {
      setStatus("已暂存本机 · 填写标题和正文后同步");
      return null;
    }
    if (signature(snapshot) === s.saved) return s.record.id;
    s.busy = true;
    s.repeat = false;
    setError(null);
    setStatus("保存中…");
    try {
      if (!(await isCurrent(s)))
        throw new Error("账户或页面已切换，请重新打开草稿。");
      await cache(s);
      const payload = await encodeDraft(snapshot);
      if (!(await isCurrent(s)))
        throw new Error("账户或页面已切换，请重新打开草稿。");
      const result = identity.version
        ? await apiPut<Draft>(
            "/drafts/" + identity.id,
            { ...payload, expected_version: identity.version },
            undefined,
            s.identity,
          )
        : await apiPost<Draft>(
            "/drafts",
            { ...payload, client_id: identity.id, status: "draft" },
            undefined,
            s.identity,
          );
      if (
        !identity.version &&
        signature(await decodeDraft(result)) !== signature(snapshot)
      )
        throw new ApiError(
          "版本冲突：该草稿已保存，请重新打开或另存副本。",
          409,
        );
      // Update only this session, even if navigation happened while the request was in flight.
      s.record = { id: result.id, version: result.version };
      s.saved = signature(snapshot);
      if (s.key === "new" && (await isCurrent(s))) {
        await clearRecovery("new", s.scope);
        s.key = result.id;
      }
      if (s.live) await cache(s);
      if (!(await isCurrent(s))) return null;
      setRecordId(result.id);
      setStatus(signature(s.doc) === s.saved ? "已保存" : "本机有新修改");
      return result.id;
    } catch (e) {
      if (!s.live || session.current !== s) return null;
      s.blocked = e instanceof ApiError && e.status === 409;
      setError(e instanceof Error ? e.message : "保存失败");
      setStatus(
        s.blocked ? "版本冲突 · 本机修改已保留" : "未同步 · 本机修改已保留",
      );
      return null;
    } finally {
      s.busy = false;
      if (s.repeat && s.live && !s.blocked) {
        s.repeat = false;
        void saveSession(s);
      }
    }
  };
  const save = async () =>
    session.current ? saveSession(session.current) : null;
  useEffect(() => {
    const s = session.current;
    if (!ready || !s?.ready || s.conflict) return;
    const local = setTimeout(() => {
      void cache(s).catch((e) => {
        if (s.live) setError("本机暂存失败：" + e.message);
      });
    }, 250);
    const remote = setTimeout(() => {
      if (!s.blocked) void saveSession(s);
    }, 1800);
    return () => {
      clearTimeout(local);
      clearTimeout(remote);
    };
  }, [doc, ready]);
  const recoverAsCopy = async () => {
    const s = session.current;
    const candidate = s?.conflict || s?.doc;
    if (!s || !candidate || !(await isCurrent(s))) return null;
    try {
      const payload = await encodeDraft(candidate);
      if (!(await isCurrent(s))) return null;
      const copy = await apiPost<Draft>(
        "/drafts",
        { ...payload, client_id: s.copyId, status: "draft" },
        undefined,
        s.identity,
      );
      if (!(await isCurrent(s))) return null;
      if (signature(await decodeDraft(copy)) !== signature(candidate))
        throw new ApiError(
          "版本冲突：之前的副本已保存；本机新修改仍保留，请重新打开后继续合并。",
          409,
        );
      await clearRecovery(s.key, s.scope);
      s.conflict = null;
      setRecoveryConflict(null);
      return copy.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "另存失败，原始修改已保留");
      return null;
    }
  };
  const useServerVersion = async () => {
    const s = session.current;
    if (!s || !(await isCurrent(s))) return;
    await clearRecovery(s.key, s.scope);
    s.conflict = null;
    s.blocked = false;
    setRecoveryConflict(null);
    setError(null);
    await cache(s);
  };
  const discardNewCache = async () => {
    if (session.current?.key === "new")
      await clearRecovery("new", session.current.scope);
  };
  return {
    doc,
    setDoc,
    ready,
    status,
    error,
    save,
    recordId,
    recoveryConflict,
    recoverAsCopy,
    useServerVersion,
    discardNewCache,
    identity: session.current?.identity,
  };
}
