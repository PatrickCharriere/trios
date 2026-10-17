import { useCallback, useSyncExternalStore } from "react";

/** Teaching mode, remembered by this browser like the language. */

const STORAGE_KEY = "trios.teaching";

let memory = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage can be blocked; fall back to the in-memory choice.
  }
  return memory;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useTeaching(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    memory = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // The choice still applies for this visit.
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}
