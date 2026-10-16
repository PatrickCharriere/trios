"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { MESSAGES, type Lang, type Messages } from "./messages";

const STORAGE_KEY = "trios.lang";
const DEFAULT_LANG: Lang = "fr";

let memoryLang: Lang | null = null;
const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    // Storage can be blocked; fall back to the in-memory choice.
  }
  return memoryLang ?? DEFAULT_LANG;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

interface I18n {
  lang: Lang;
  t: Messages;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);

  const setLang = useCallback((next: Lang) => {
    memoryLang = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore: the choice still applies for this visit.
    }
    listeners.forEach((l) => l());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, t: MESSAGES[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
