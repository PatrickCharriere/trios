import { analysisSteps, type Analysis, type CoachOptions, type CoachPosition, type GameView } from "@/engine";

/** How long the coach works before letting the page handle taps and redraw. */
const SLICE_MS = 12;

/**
 * Asks the coach about a position. Its look ahead runs in short slices between
 * the page's own work, so the game stays responsive while it thinks.
 */
export function runCoach(position: CoachPosition, options: CoachOptions = {}): Promise<Analysis> {
  const steps = analysisSteps(position, options);
  return new Promise((resolve) => {
    const slice = () => {
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

/** The position as the player in `view.seat` sees it. */
export function positionOf(view: GameView): CoachPosition | null {
  if (view.seat === null) return null;
  const next = (view.seat + 1) % view.players.length;
  return { board: view.board, rack: view.rack, firstRound: view.firstRound, nextRack: view.rackCounts[next] ?? 0 };
}
