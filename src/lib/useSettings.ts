import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, getSettings, subscribeSettings, updateSettings, type Settings } from "./settings";

/** The settings, kept up to date, and the function that changes them. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS);
  return [settings, updateSettings];
}
