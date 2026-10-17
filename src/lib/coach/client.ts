import {
  analysisSteps,
  dangerSteps,
  type Analysis,
  type CoachOptions,
  type CoachPosition,
  type Danger,
  type GameView,
} from "@/engine";

/** How long the coach works before letting the page handle taps and redraw. */
const SLICE_MS = 12;

/**
 * Runs stepped work in short slices between the page's own work, so the game
 * stays responsive while the coach thinks. Resolves to null if `stopped`
 * turns true first (the position changed, so the answer would be stale).
 */
function sliced<T>(steps: Generator<void, T>, stopped: () => boolean): Promise<T | null> {
  return new Promise((resolve) => {
    const slice = () => {
      if (stopped()) {
        resolve(null);
        return;
      }
      const until = performance.now() + SLICE_MS;
      for (;;) {
        const step = steps.next();
        if (step.done) {
          resolve(step.value);
          return;
        }
        if (performance.now() >= until) break;
      }
      window.setTimeout(slice, 0);
    };
    window.setTimeout(slice, 0);
  });
}

/** Asks the coach for its ideas about a position. */
export const runCoach = (position: CoachPosition, options: CoachOptions = {}): Promise<Analysis> =>
  sliced(analysisSteps(position, options), () => false) as Promise<Analysis>;

/** Where the next player could score big, or null if stopped first. */
export const runDanger = (position: CoachPosition, stopped: () => boolean): Promise<Danger[] | null> =>
  sliced(dangerSteps(position), stopped);

/** The position as the player in `view.seat` sees it. */
export function positionOf(view: GameView): CoachPosition | null {
  if (view.seat === null) return null;
  const next = (view.seat + 1) % view.players.length;
  return { board: view.board, rack: view.rack, firstRound: view.firstRound, nextRack: view.rackCounts[next] ?? 0 };
}
