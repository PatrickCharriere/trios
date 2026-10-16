import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  CELL_COUNT,
  CENTRE,
  applyMove,
  cellAt,
  chooseMove,
  createGame,
  isBoardDead,
  seededRng,
  viewFor,
  type BotLevel,
  type GameState,
} from "./index";

const two = [
  { name: "Ana", kind: "human" as const },
  { name: "Bob", kind: "human" as const },
];

function tileCount(state: GameState) {
  return state.board.filter(Boolean).length + state.bag.length + state.racks.flat().length;
}

/** Every maximal line on the board must be at most 3 long, pairs <= 15 and trios = 15. */
function assertBoardLegal(state: GameState) {
  for (const horizontal of [true, false]) {
    for (let line = 0; line < BOARD_SIZE; line++) {
      let run: number[] = [];
      const flush = () => {
        if (run.length > 3) throw new Error(`run of ${run.length}`);
        const sum = run.reduce((a, b) => a + b, 0);
        if (run.length === 2 && sum > 15) throw new Error(`pair sums to ${sum}`);
        if (run.length === 3 && sum !== 15) throw new Error(`trio sums to ${sum}`);
        run = [];
      };
      for (let i = 0; i < BOARD_SIZE; i++) {
        const tile = state.board[horizontal ? cellAt(line, i) : cellAt(i, line)];
        if (tile) run.push(tile.value);
        else flush();
      }
      flush();
    }
  }
}

describe("createGame", () => {
  it("deals three tiles each and sets three aside", () => {
    const state = createGame(two, seededRng(1));
    expect(state.racks.map((r) => r.length)).toEqual([3, 3]);
    expect(state.bag).toHaveLength(83 - 3 - 6);
    expect(state.board).toHaveLength(CELL_COUNT);
    expect(state.status).toBe("playing");
  });

  it("refuses too few or too many players", () => {
    expect(() => createGame([two[0]])).toThrow();
    expect(() => createGame([...two, ...two, two[0]])).toThrow();
  });
});

describe("applyMove", () => {
  function opening(): GameState {
    const state = createGame(two, seededRng(7));
    state.current = 0;
    state.racks[0] = [
      { id: 900, face: 4 },
      { id: 901, face: 5 },
      { id: 902, face: 6 },
    ];
    return state;
  }

  it("places tiles, scores, refills the rack and passes the turn", () => {
    const state = opening();
    const before = structuredClone(state);
    const result = applyMove(state, 0, {
      type: "place",
      placements: [
        { tileId: 900, cell: CENTRE - 1 },
        { tileId: 901, cell: CENTRE },
        { tileId: 902, cell: CENTRE + 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].score).toBe(110);
    expect(result.state.racks[0]).toHaveLength(3);
    expect(result.state.bag).toHaveLength(state.bag.length - 3);
    expect(result.state.current).toBe(1);
    expect(result.state.version).toBe(1);
    expect(state).toEqual(before);
  });

  it("refuses moves out of turn", () => {
    const result = applyMove(opening(), 1, { type: "pass" });
    expect(result).toEqual({ ok: false, error: "notYourTurn" });
  });

  it("lets a player go again after covering a replay square", () => {
    const state = opening();
    state.board[cellAt(5, 6)] = { id: 950, value: 6, wild: false, player: 1, turn: 0 };
    state.racks[0][0] = { id: 900, face: 2 };
    const result = applyMove(state, 0, { type: "place", placements: [{ tileId: 900, cell: cellAt(4, 6) }] });
    expect(result.ok && result.state.current).toBe(0);
  });

  it("exchanges tiles while the bag holds at least five", () => {
    const state = opening();
    const result = applyMove(state, 0, { type: "exchange", tileIds: [900, 901] }, seededRng(3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.racks[0]).toHaveLength(3);
    expect(result.state.bag).toHaveLength(state.bag.length);
    expect(tileCount(result.state)).toBe(tileCount(state));

    const low = opening();
    low.bag = low.bag.slice(0, 4);
    expect(applyMove(low, 0, { type: "exchange", tileIds: [900] })).toEqual({
      ok: false,
      error: "exchangeBagLow",
    });
  });

  it("stops after two full rounds without a tile placed", () => {
    let state = opening();
    const moves = [{ type: "pass" }, { type: "exchange", tileIds: [] as number[] }, { type: "pass" }, { type: "pass" }];
    for (const [i, template] of moves.entries()) {
      expect(state.status).toBe("playing");
      const player = state.current;
      const move =
        template.type === "exchange"
          ? { type: "exchange" as const, tileIds: [state.racks[player][0].id] }
          : { type: "pass" as const };
      const result = applyMove(state, player, move, seededRng(i));
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(state.status).toBe("over");
    expect(state.endReason).toBe("stalled");
  });

  it("ends the game when no tile of any value fits on the board", () => {
    // A real position from a bot game: the tiles form a staircase where every
    // free neighbour would make a run of four or a trio that is not 15.
    const rows: (number | null)[][] = [
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 2],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, 3, 3],
      [null, null, null, null, null, null, null, null, null, null, null, 1, 2, 12, null],
      [null, null, null, null, null, null, null, null, null, null, null, 6, 9, 0, null],
      [null, null, null, null, null, null, null, null, null, null, 6, 8, null, null, null],
      [null, null, null, null, null, null, null, null, null, 8, 2, null, null, null, null],
      [null, null, null, null, null, null, null, null, 0, 4, null, null, null, null, null],
      [null, null, null, null, null, null, null, 10, 2, 3, null, null, null, null, null],
      [null, null, null, null, null, null, 10, 5, null, null, null, null, null, null, null],
      [null, null, null, null, null, 7, 1, null, null, null, null, null, null, null, null],
      [null, null, null, null, 6, 5, 4, null, null, null, null, null, null, null, null],
      [null, null, null, 11, 1, 3, null, null, null, null, null, null, null, null, null],
      [4, null, 13, 2, null, null, null, null, null, null, null, null, null, null, null],
      [8, 6, 1, null, null, null, null, null, null, null, null, null, null, null, null],
      [3, 7, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ];
    const state = opening();
    rows.forEach((row, r) =>
      row.forEach((value, c) => {
        state.board[cellAt(r, c)] = value === null ? null : { id: 2000 + r * 15 + c, value, wild: false, player: 1, turn: 0 };
      }),
    );
    expect(isBoardDead(state.board)).toBe(true);
    const result = applyMove(state, 0, { type: "pass" });
    expect(result.ok && result.state.endReason).toBe("blocked");

    expect(isBoardDead(opening().board)).toBe(false);
    state.board[cellAt(14, 1)] = null;
    expect(isBoardDead(state.board)).toBe(false);
  });

  it("gives the player who goes out the value of the other racks", () => {
    const state = opening();
    state.bag = [];
    state.board[CENTRE] = { id: 950, value: 5, wild: false, player: 1, turn: 0 };
    state.racks[0] = [{ id: 900, face: 10 }];
    state.racks[1] = [
      { id: 910, face: 3 },
      { id: 911, face: null },
      { id: 912, face: 9 },
    ];
    const result = applyMove(state, 0, { type: "place", placements: [{ tileId: 900, cell: CENTRE + 1 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("over");
    expect(result.state.endReason).toBe("out");
    expect(result.state.finalBonus).toEqual({ player: 0, points: 12 });
    expect(result.state.players[0].score).toBe(15 + 12);
    expect(result.state.winners).toEqual([0]);
  });

  it("ends a blocked game once the bag is empty and nobody can play", () => {
    const state = opening();
    state.bag = [];
    state.board[CENTRE] = { id: 950, value: 5, wild: false, player: 1, turn: 0 };
    state.racks[0] = [
      { id: 900, face: 10 },
      { id: 901, face: 15 },
    ];
    state.racks[1] = [{ id: 910, face: 14 }];
    const result = applyMove(state, 0, { type: "place", placements: [{ tileId: 900, cell: CENTRE + 1 }] });
    expect(result.ok && result.state.endReason).toBe("blocked");
  });
});

describe("viewFor", () => {
  it("hides the other racks and the bag", () => {
    const state = createGame(two, seededRng(2));
    const view = viewFor(state, 1);
    expect(view.rack).toEqual(state.racks[1]);
    expect(view.rackCounts).toEqual([3, 3]);
    expect(view.bagCount).toBe(state.bag.length);
    expect(JSON.stringify(view)).not.toContain('"bag"');
    expect(view.racks).toBeUndefined();
  });
});

describe("full games between bots", () => {
  const levels: BotLevel[] = ["easy", "normal", "hard"];
  for (let seed = 1; seed <= 6; seed++) {
    it(`plays seed ${seed} to the end with a legal board`, () => {
      const rng = seededRng(seed);
      const players = [0, 1, 2].slice(0, 2 + (seed % 3)).map((i) => ({
        name: `Bot ${i}`,
        kind: "bot" as const,
        level: levels[(seed + i) % 3],
      }));
      let state = createGame(players, rng);
      const total = tileCount(state);
      for (let guard = 0; state.status === "playing"; guard++) {
        if (guard > 500) throw new Error("game did not finish");
        const p = state.current;
        const result = applyMove(state, p, chooseMove(state, p, state.players[p].level!, rng), rng);
        if (!result.ok) throw new Error(`bot made an illegal move: ${result.error}`);
        state = result.state;
        assertBoardLegal(state);
        expect(tileCount(state)).toBe(total);
      }
      expect(state.winners!.length).toBeGreaterThan(0);
      expect(state.board.filter(Boolean).length).toBeGreaterThan(20);
    });
  }
});
