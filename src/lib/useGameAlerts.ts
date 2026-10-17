import { useEffect, useRef } from "react";
import type { GameView } from "@/engine";
import type { Snapshot } from "./online/protocol";
import { playSound } from "./sound";

/** Plays the end of game tune when a game finishes on screen. */
export function useGameOverTune(status: GameView["status"]) {
  const previous = useRef(status);
  useEffect(() => {
    if (status === "over" && previous.current === "playing") playSound("over");
    previous.current = status;
  }, [status]);
}

/**
 * Online games: lets the player know when it becomes their turn, after someone
 * else's move or as the game starts. A chime and, while the page is in a
 * background tab, `title` as the tab's title. Nothing sounds when a game is
 * first opened.
 */
export function useTurnAlert(snapshot: Snapshot | null, canAct: boolean, title: string) {
  // Whether the player could act at the last update; null until the game has loaded.
  const could = useRef<boolean | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const before = could.current;
    could.current = canAct;
    if (before !== false || !canAct) return;
    // Not after a play again turn of the player's own. A game that just started has no moves yet.
    const view = snapshot.view;
    const last = view ? view.log[view.log.length - 1] : undefined;
    if (last && last.player === view?.seat) return;
    playSound("turn");
    if (document.hidden) flagTitle(title);
  }, [snapshot, canAct, title]);
}

/** Shows `text` as the tab's title until the player comes back to the tab. */
function flagTitle(text: string) {
  const original = document.title;
  document.title = text;
  const restore = () => {
    if (document.hidden) return;
    document.title = original;
    document.removeEventListener("visibilitychange", restore);
  };
  document.addEventListener("visibilitychange", restore);
}
