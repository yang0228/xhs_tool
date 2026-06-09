import type { UserSettings } from "../../shared/types";
import { DEFAULT_BACKEND_URL } from "../../shared/constants";

export const defaultSettings: UserSettings = {
  apiKey: "",
  backendUrl: DEFAULT_BACKEND_URL,
  aiModel: "claude-sonnet-4-20250514",
};

export async function readSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get<{
    settings?: Partial<UserSettings>;
  }>("settings");
  const settings = { ...defaultSettings, ...result.settings };
  settings.backendUrl = (
    settings.backendUrl.trim() || DEFAULT_BACKEND_URL
  ).replace(/\/+$/, "");
  return settings;
}

let pendingSave: Promise<unknown> = Promise.resolve();
export function saveSettings(
  partial: Partial<UserSettings>,
): Promise<UserSettings> {
  const write = async () => {
    const settings = { ...(await readSettings()), ...partial };
    settings.backendUrl = (
      settings.backendUrl.trim() || DEFAULT_BACKEND_URL
    ).replace(/\/+$/, "");
    await chrome.storage.local.set({ settings });
    return settings;
  };
  const result = pendingSave.then(async () =>
    navigator.locks
      ? await navigator.locks.request("xhs-settings", write)
      : await write(),
  );
  pendingSave = result.catch(() => {});
  return result;
}
