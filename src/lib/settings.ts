// No React in this file: the page layout, a server component, imports THEME_SCRIPT.
// The hook is in useSettings.ts.

/**
 * Preferences this browser remembers. The player's name, the language and
 * teaching mode keep their own stores; the settings dialog edits them all.
 */
export interface Settings {
  sound: boolean;
  volume: Volume;
  theme: Theme;
  /** The last move keeps glowing until the next one is played. */
  blink: boolean;
  /** Push notifications for online games on this device (see src/lib/push/client.ts). */
  notify: boolean;
}

export type Volume = "low" | "medium" | "high";
export type Theme = "auto" | "light" | "dark";

export const SETTINGS_KEY = "trios.settings.v1";
export const DEFAULT_SETTINGS: Settings = { sound: true, volume: "medium", theme: "auto", blink: true, notify: false };

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Reads stored settings, keeping only known values so an old or edited entry can't break the page. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      sound: typeof data.sound === "boolean" ? data.sound : DEFAULT_SETTINGS.sound,
      volume: oneOf(data.volume, ["low", "medium", "high"], DEFAULT_SETTINGS.volume),
      theme: oneOf(data.theme, ["auto", "light", "dark"], DEFAULT_SETTINGS.theme),
      blink: typeof data.blink === "boolean" ? data.blink : DEFAULT_SETTINGS.blink,
      notify: typeof data.notify === "boolean" ? data.notify : DEFAULT_SETTINGS.notify,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Fallback for when the browser blocks storage: the choices last for this visit.
let memory: Settings = DEFAULT_SETTINGS;
// The same object for the same stored text, as useSyncExternalStore needs.
let cached: { raw: string; value: Settings } | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return memory;
  }
  if (raw === null) return memory;
  if (cached?.raw !== raw) cached = { raw, value: parseSettings(raw) };
  return cached.value;
}

/** Shows the chosen theme; "auto" follows the system. */
export function applyTheme(theme: Theme) {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

/** Follows a theme picked in another tab of the game. Returns a function that stops following. */
export function followThemeFromOtherTabs(): () => void {
  const follow = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY) applyTheme(parseSettings(e.newValue).theme);
  };
  window.addEventListener("storage", follow);
  return () => window.removeEventListener("storage", follow);
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch };
  memory = next;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Kept in memory for this visit.
  }
  applyTheme(next.theme);
  listeners.forEach((l) => l());
}

/** Calls `listener` whenever the settings change, in this tab or another. */
export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Runs in the page head before anything is painted, so a chosen theme never flashes the other one first. */
export const THEME_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}");if(s.theme==="light"||s.theme==="dark")document.documentElement.setAttribute("data-theme",s.theme)}catch(e){}})()`;
