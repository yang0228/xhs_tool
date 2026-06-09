import { useEffect, useState } from "react";
import type { UserSettings } from "../../shared/types";
import { defaultSettings, readSettings, saveSettings } from "../lib/settings";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    readSettings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const updateSettings = async (partial: Partial<UserSettings>) => {
    const next = await saveSettings(partial);
    setSettings(next);
    setError(null);
  };
  return { settings, updateSettings, loaded, error };
}
