import { useEffect, useState } from "react";
import type { UserSettings } from "../../../shared/types";

const defaults: UserSettings = {
  apiKey: "",
  backendUrl: "http://localhost:8000/api",
  aiModel: "claude-sonnet-4-20250514",
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["settings"], (result) => {
      if (result.settings) {
        setSettings({ ...defaults, ...result.settings });
      }
      setLoaded(true);
    });
  }, []);

  const updateSettings = async (partial: Partial<UserSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await chrome.storage.local.set({ settings: next });
  };

  return { settings, updateSettings, loaded };
}
