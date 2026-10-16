import type { GameState, PlayerSetup } from "@/engine";

const SAVE_KEY = "trios.local.v1";

/** Fallback when the browser blocks storage, so Home can still hand a game to /play. */
let memorySave: LocalSave | null = null;

export interface LocalSave {
  setup: PlayerSetup[];
  state: GameState;
}

export function loadLocal(): LocalSave | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return memorySave;
    const save = JSON.parse(raw) as LocalSave;
    // Saves from an older version of the game state are ignored rather than crashing.
    return save?.state?.board?.length && typeof save.state.scoreless === "number" ? save : null;
  } catch {
    return memorySave;
  }
}

export function saveLocal(save: LocalSave) {
  memorySave = save;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Without storage the game still runs; it just can't be resumed.
  }
}

export function clearLocal() {
  memorySave = null;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
