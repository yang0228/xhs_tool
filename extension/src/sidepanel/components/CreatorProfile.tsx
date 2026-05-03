import { useEffect, useState } from "react";
import type { EncryptedPayload } from "../../shared/types";
import { apiGet, apiPut, type ApiIdentity } from "../lib/api";
import { encryptContent, decryptContent } from "../lib/crypto";
import {
  emptyProfile,
  parseProfile,
  type CreatorProfile as Profile,
} from "../lib/creator";
import { readSettings } from "../lib/settings";
import { ErrorNotice } from "./UI";

export default function CreatorProfile() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [version, setVersion] = useState<number | null>(null);
  const [identity, setIdentity] = useState<ApiIdentity>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<AbortController | null>(null);
  useEffect(() => () => active?.abort(), [active]);
  const load = async () => {
    const controller = new AbortController();
    setActive(controller);
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const origin = await readSettings();
      const result = await apiGet<{
        encrypted_profile: EncryptedPayload | null;
        version: number;
      }>("/profile", controller.signal, origin);
      const parsed = result.encrypted_profile
        ? parseProfile(
            JSON.parse(await decryptContent(result.encrypted_profile)),
          )
        : emptyProfile();
      const current = await readSettings();
      if (
        controller.signal.aborted ||
        current.apiKey !== origin.apiKey ||
        current.backendUrl !== origin.backendUrl
      )
        return;
      setProfile(parsed);
      setVersion(result.version);
      setIdentity(origin);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const save = async () => {
    if (version === null || !identity) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const result = await apiPut<{ version: number }>(
        "/profile",
        {
          encrypted_profile: await encryptContent(
            JSON.stringify(parseProfile(profile)),
          ),
          expected_version: version,
        },
        active?.signal,
        identity,
      );
      const current = await readSettings();
      if (
        current.apiKey !== identity.apiKey ||
        current.backendUrl !== identity.backendUrl
      )
        throw new Error("账号已切换，请重新读取档案");
      setVersion(result.version);
      setMessage("创作档案已加密保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack">
      <h3>个人创作档案</h3>
      <p className="help">
        档案加密保存；执行 AI 写作时才发送所采用的风格。最多保留三篇参考。
      </p>
      <button className="btn" disabled={busy} onClick={() => void load()}>
        读取创作档案
      </button>
      {version !== null && (
        <>
          <fieldset
            className="stack"
            disabled={busy}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            {(
              [
                ["position", "内容定位"],
                ["audience", "目标读者"],
                ["tone", "语气与风格"],
                ["avoid", "避免的表达"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  className="field"
                  maxLength={1000}
                  value={profile[key]}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            {[0, 1, 2].map((index) => (
              <label key={index}>
                风格参考 {index + 1}
                <textarea
                  className="field"
                  maxLength={2000}
                  value={profile.examples[index] ?? ""}
                  onChange={(e) => {
                    const examples = [...profile.examples];
                    while (examples.length <= index) examples.push("");
                    examples[index] = e.target.value;
                    setProfile({ ...profile, examples });
                  }}
                />
              </label>
            ))}
            <button className="btn btn-primary" onClick={() => void save()}>
              保存创作档案
            </button>
          </fieldset>
          <p role="status">{message}</p>
        </>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}
