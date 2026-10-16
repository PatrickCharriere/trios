import type { GameState, PlayerSetup } from "@/engine";

const SAVE_KEY = "trios.local.v1";

export interface LocalSave {
  setup: PlayerSetup[];
  state: GameState;
}

export function loadLocal(): LocalSave | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as LocalSave;
    return save?.state?.board?.length ? save : null;
  } catch {
    return null;
  }
}

export function saveLocal(save: LocalSave) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Without storage the game still runs; it just can't be resumed.
  }
}

export function clearLocal() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
