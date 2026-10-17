import { describe, expect, it } from "vitest";
import { analyse, applyMove, chooseMove, createGame, inFirstRound, seededRng, type GameState, type Move } from "./index";

/**
 * The coach's top idea against the hard bot, to measure the coach when its
 * weights change. Skipped unless asked for, as each game takes a few seconds:
 *
 *   COACH_GAMES=40 npx vitest run coach.selfplay --silent=false
 */
const GAMES = Number(process.env.COACH_GAMES ?? 0);

describe.skipIf(!GAMES)("coach against the hard bot", () => {
  it(
    `wins more than it loses over ${GAMES} games`,
    () => {
      let wins = 0;
      let margin = 0;
      for (let game = 1; game <= GAMES; game++) {
        const rng = seededRng(game * 7919);
        const coach = game % 2;
        const players = [0, 1].map((i) => ({ name: `P${i}`, kind: "bot" as const, level: "hard" as const }));
        let state: GameState = createGame(players, rng);
        while (state.status === "playing") {
          const p = state.current;
          let move: Move = chooseMove(state, p, "hard", rng);
          if (p === coach) {
            const best = analyse({
              board: state.board,
              rack: state.racks[p],
              firstRound: inFirstRound(state),
              nextRack: state.racks[1 - p].length,
            }).ideas[0];
            if (best) move = { type: "place", placements: best.placements };
          }
          const result = applyMove(state, p, move, rng);
          if (!result.ok) throw new Error(result.error);
          state = result.state;
        }
        const diff = state.players[coach].score - state.players[1 - coach].score;
        margin += diff;
        if (diff > 0) wins++;
      }
      console.log(`coach won ${wins} of ${GAMES}, average margin ${(margin / GAMES).toFixed(1)} points`);
      expect(wins).toBeGreaterThan(GAMES / 2);
    },
    GAMES * 30_000,
  );
});
