import { useEffect, useState } from "react";
import { readSettings, saveSettings } from "../lib/settings";
import {
  collectBackup,
  downloadBackup,
  normalizeBackendUrl,
  openBackup,
  restoreBackup,
  sealBackup,
  type BackupPayload,
} from "../lib/backup";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`请求失败 (${response.status})`);
  return response.json();
}
export default function Settings() {
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000/api");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    readSettings()
      .then((settings) => {
        if (active) {
          setBackendUrl(settings.backendUrl);
          setApiKey(settings.apiKey);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const url = normalizeBackendUrl(backendUrl);
    await saveSettings({ backendUrl: url, apiKey: apiKey.trim() });
    setBackendUrl(url);
    setPending(null);
    setConfirmed(false);
  };
  const identity = async () => {
    if (!apiKey.trim()) throw new Error("请先填写现有 API Key，或初始化新账号");
    const data = await fetchJson(
      normalizeBackendUrl(backendUrl) + "/auth/verify",
      { method: "POST", headers: { Authorization: `Bearer ${apiKey.trim()}` } },
    );
    if (
      data.valid !== true ||
      typeof data.user_id !== "string" ||
      !data.user_id
    )
      throw new Error("身份响应无效");
    return data.user_id as string;
  };
  const register = async () => {
    if (apiKey.trim()) throw new Error("已有 API Key，请直接测试连接");
    const existing = await readSettings();
    if (
      existing.apiKey &&
      !window.confirm(
        "这将切换到一个空的新账号。请确认已保存原 API Key 和加密备份。继续初始化？",
      )
    )
      return;
    const url = normalizeBackendUrl(backendUrl);
    const data = await fetchJson(url + "/auth/register", { method: "POST" });
    if (
      typeof data.api_key !== "string" ||
      !data.api_key.startsWith("xhs_") ||
      typeof data.user_id !== "string"
    )
      throw new Error("注册响应无效，原设置未改变");
    await saveSettings({ backendUrl: url, apiKey: data.api_key });
    setApiKey(data.api_key);
    setBackendUrl(url);
    setPending(null);
    setStatus("新账号已初始化，API Key 已保存；请妥善保管");
  };
  const testConnection = async () => {
    const health = await fetchJson(normalizeBackendUrl(backendUrl) + "/health");
    if (health.status !== "ok") throw new Error("后端健康检查未通过");
    try {
      const id = await identity();
      setStatus(`后端在线 · 身份验证通过 · ${id}`);
    } catch (reason) {
      throw new Error(
        `后端在线 · 身份验证失败：${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  };
  return (
    <div className="page">
      <div>
        <p className="eyebrow">工作台偏好</p>
        <h2>设置</h2>
        <p className="muted">连接你的后端，保管账号与创作数据。</p>
      </div>
      <section className="card stack">
        <h3 className="section-title">连接与账号</h3>
        <label className="field-label" htmlFor="backend-url">
          后端地址
          <input
            className="field"
            id="backend-url"
            type="url"
            value={backendUrl}
            disabled={!loaded || busy}
            onChange={(e) => {
              setBackendUrl(e.target.value);
              setPending(null);
            }}
          />
        </label>
        <label className="field-label" htmlFor="api-key">
          API Key
          <input
            className="field"
            id="api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={!loaded || busy}
            onChange={(e) => {
              setApiKey(e.target.value);
              setPending(null);
            }}
            placeholder="填写现有账号的 API Key"
          />
        </label>
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!loaded || busy}
            onClick={() =>
              run(async () => {
                await save();
                setStatus("设置已保存");
              })
            }
          >
            保存设置
          </button>
          <button
            className="btn"
            disabled={!loaded || busy}
            onClick={() => run(testConnection)}
          >
            测试连接与身份
          </button>
        </div>
        <p className="muted">
          已有账号请填写原 API Key。初始化会创建一个空账号，不会找回旧数据。
        </p>
        <button
          className="btn"
          disabled={!loaded || busy || !!apiKey.trim()}
          onClick={() => run(register)}
        >
          初始化新账号
        </button>
      </section>
      <section className="card stack">
        <h3 className="section-title">加密备份</h3>
        <p className="muted">
          备份包含素材、草稿、图片引用、发布记录、指标、本地密钥及待恢复编辑。图片文件仍保存在原存储服务。密码无法找回，请保存在安全的地方。
        </p>
        <label className="field-label" htmlFor="backup-password">
          备份密码（至少 10 个字符）
          <input
            className="field"
            id="backup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value);
              setPending(null);
            }}
          />
        </label>
        <button
          className="btn"
          disabled={!loaded || busy || password.length < 10 || !apiKey.trim()}
          onClick={() =>
            run(async () => {
              await save();
              const data = await collectBackup();
              downloadBackup(await sealBackup(data, password));
              setPassword("");
              setStatus("加密备份已下载");
            })
          }
        >
          导出加密备份
        </button>
        <label className="field-label" htmlFor="backup-file">
          恢复文件
          <input
            className="field"
            id="backup-file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPending(null);
              setConfirmed(false);
            }}
          />
        </label>
        <button
          className="btn"
          disabled={
            !loaded || busy || !file || password.length < 10 || !apiKey.trim()
          }
          onClick={() =>
            run(async () => {
              if (!file || file.size > 50 * 1024 * 1024)
                throw new Error("请选择小于 50 MB 的备份文件");
              const data = await openBackup(
                JSON.parse(await file.text()),
                password,
              );
              const id = await identity();
              if (
                normalizeBackendUrl(data.backendUrl) !==
                  normalizeBackendUrl(backendUrl) ||
                data.userId !== id
              )
                throw new Error("备份的后端地址或账号与当前连接不匹配");
              setPending(data);
              setConfirmed(false);
              setStatus("密码与账号验证通过，请核对后确认恢复");
            })
          }
        >
          检查备份
        </button>
        {pending && (
          <div>
            <p>
              备份时间：{new Date(pending.createdAt).toLocaleString()}
              <br />
              后端：{pending.backendUrl}
              <br />
              账号：{pending.userId}
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我确认将数据合并到此账号，保留已有记录和本地编辑。
            </label>
            <button
              className="btn btn-primary"
              disabled={busy || !confirmed}
              onClick={() =>
                run(async () => {
                  const data = pending;
                  const id = await identity();
                  await save();
                  await restoreBackup(data, id);
                  setPassword("");
                  setPending(null);
                  setConfirmed(false);
                  setStatus("备份已恢复，请重新打开素材库或草稿");
                })
              }
            >
              确认恢复
            </button>
          </div>
        )}
      </section>
      {busy && (
        <p role="status" className="muted">
          正在处理…
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
