import { describe, expect, it } from "vitest";
import {
  CELL_COUNT,
  CENTRE,
  TRIOS_OF_15,
  analyse,
  dangerMap,
  applyMove,
  cellAt,
  chooseMove,
  createGame,
  evaluatePlacement,
  grade,
  inFirstRound,
  openSquares,
  readBoard,
  readSquare,
  reasons,
  seededRng,
  squaresFormed,
  type GameState,
  type Idea,
  type PlacedTile,
  type Tile,
} from "./index";

function board(tiles: [row: number, col: number, value: number][]): (PlacedTile | null)[] {
  const out: (PlacedTile | null)[] = Array(CELL_COUNT).fill(null);
  tiles.forEach(([r, c, value], i) => {
    out[cellAt(r, c)] = { id: 500 + i, value, wild: false, player: 0, turn: i };
  });
  return out;
}

describe("TRIOS_OF_15", () => {
  it("lists the 27 sets of three values that make 15", () => {
    expect(TRIOS_OF_15).toHaveLength(27);
    expect(TRIOS_OF_15[0]).toEqual([0, 0, 15]);
    expect(TRIOS_OF_15.at(-1)).toEqual([5, 5, 5]);
    for (const [a, b, c] of TRIOS_OF_15) {
      expect(a + b + c).toBe(15);
      expect(a <= b && b <= c && c <= 15).toBe(true);
    }
  });
});

describe("readSquare", () => {
  it("next to a 3 and a 9, asks for exactly a 3", () => {
    const b = board([
      [7, 7, 3],
      [7, 8, 9],
    ]);
    const reading = readSquare(b, cellAt(7, 9))!;
    expect(reading.lines).toEqual([{ horizontal: true, run: [3, 9, null], sum: 12, need: { kind: "trio", value: 3 } }]);
    expect(reading.options.map((o) => o.value)).toEqual([3]);
    expect(reading.options[0]).toMatchObject({ trio: true, points: 30 });
  });

  it("next to a single 10, allows 0 to 5 as a pair", () => {
    const reading = readSquare(board([[7, 7, 10]]), cellAt(7, 8))!;
    expect(reading.lines[0].need).toEqual({ kind: "pair", max: 5 });
    expect(reading.options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reading.options[5]).toMatchObject({ trio: false, points: 15 });
  });

  it("reports squares nothing can fill, and why", () => {
    const between = readSquare(
      board([
        [7, 6, 9],
        [7, 8, 9],
      ]),
      cellAt(7, 7),
    )!;
    expect(between.lines[0].need).toEqual({ kind: "blocked", reason: "tooHigh" });
    expect(between.options).toEqual([]);

    const pastTrio = readSquare(
      board([
        [7, 5, 4],
        [7, 6, 5],
        [7, 7, 6],
      ]),
      cellAt(7, 8),
    )!;
    expect(pastTrio.lines[0].need).toEqual({ kind: "blocked", reason: "tooLong" });
    expect(pastTrio.options).toEqual([]);
  });

  it("only reads empty squares a tile can reach", () => {
    const b = board([[7, 7, 3]]);
    expect(readSquare(b, cellAt(7, 7))).toBeNull();
    expect(readSquare(b, cellAt(0, 0))).toBeNull();
    const empty = board([]);
    expect(readSquare(empty, cellAt(7, 8))).toBeNull();
    expect(readSquare(empty, CENTRE)!.options).toHaveLength(16);
    expect(readBoard(b)).toHaveLength(4);
  });
});

describe("board measures", () => {
  it("counts squares of four and open squares", () => {
    const b = board([
      [7, 7, 1],
      [7, 8, 2],
      [8, 7, 3],
      [8, 8, 4],
    ]);
    expect(squaresFormed((cell) => b[cell] !== null, [cellAt(8, 8)])).toBe(1);
    expect(squaresFormed((cell) => b[cell] !== null, [cellAt(7, 7)])).toBe(1);
    expect(openSquares(b)).toBe(8);
    expect(openSquares(board([]))).toBe(1);
  });
});

describe("analyse", () => {
  // A 5 sits two squares below the x3 at the top of column 4 (row 1).
  const position = {
    board: board([[3, 4, 5]]),
    rack: [
      { id: 900, face: 5 },
      { id: 901, face: 3 },
      { id: 902, face: 0 },
    ] as Tile[],
    firstRound: false,
    nextRack: 3,
  };
  const fiveAbove = [{ tileId: 900, cell: cellAt(2, 4) }];
  const threeBeside = [{ tileId: 901, cell: cellAt(3, 5) }];

  it("sees that 5 + 5 under the x3 hands the next player a big trio", () => {
    // The next player holds a single 5: after 5 + 5, it lands on the x3 for a trio worth 90.
    const fives = Array.from({ length: 10 }, (_, i): Tile => ({ id: 600 + i, face: 5 }));
    const known = { ...position, nextRack: 1, unseen: fives };
    const risky = analyse(known, { shortlist: 0, include: fiveAbove }).included!;
    const safe = analyse(known, { shortlist: 0, include: threeBeside }).included!;
    expect(risky.reply).toBe(90);
    expect(safe.reply).toBeLessThan(20);
    expect(risky.value).toBeLessThan(safe.value);
    expect(reasons(safe, risky)).toContainEqual({ kind: "safer", reply: safe.reply, otherReply: 90 });
    expect(analyse(known).ideas[0].cells).not.toEqual([cellAt(2, 4)]);
  });

  it("only suggests legal moves, best first, the same way every time", () => {
    const first = analyse(position);
    const again = analyse(position);
    expect(first.ideas.length).toBeGreaterThan(1);
    expect(again.ideas).toEqual(first.ideas);
    for (const idea of first.ideas) {
      expect(evaluatePlacement(position.board, position.rack, idea.placements).ok).toBe(true);
    }
    const values = first.ideas.map((i) => i.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(first.greedy!.score).toBe(Math.max(...first.ideas.map((i) => i.score)));
  });

  it("rates the move the player made, whichever identical tile they used", () => {
    const rack: Tile[] = [...position.rack, { id: 903, face: 5 }];
    const played = analyse({ ...position, rack }, { include: [{ tileId: 903, cell: cellAt(2, 4) }] });
    expect(played.included).toMatchObject({ cells: [cellAt(2, 4)], score: 10 });
    expect(analyse(position, { include: [{ tileId: 900, cell: 0 }] }).included).toBeNull();
  });

  it("has nothing to suggest without a legal move", () => {
    expect(analyse({ ...position, rack: [] })).toEqual({ ideas: [], greedy: null, included: null });
  });

  it("analyses a real mid-game position quickly", () => {
    const rng = seededRng(4);
    const players = [0, 1].map((i) => ({ name: `Bot ${i}`, kind: "bot" as const, level: "normal" as const }));
    let state: GameState = createGame(players, rng);
    while (state.board.filter(Boolean).length < 30) {
      const result = applyMove(state, state.current, chooseMove(state, state.current, "normal", rng), rng);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const seat = state.current;
    const started = performance.now();
    const analysis = analyse({
      board: state.board,
      rack: state.racks[seat],
      firstRound: inFirstRound(state),
      nextRack: state.racks[1 - seat].length,
    });
    expect(performance.now() - started).toBeLessThan(3000);
    expect(analysis.ideas[0].value).toBeGreaterThanOrEqual(analysis.greedy!.value);
  });
});

describe("dangerMap", () => {
  // After 5 + 5 just under the x3 at the top of column 4.
  const fives = Array.from({ length: 10 }, (_, i): Tile => ({ id: 600 + i, face: 5 }));
  const opened = {
    board: board([
      [2, 4, 5],
      [3, 4, 5],
    ]),
    rack: [] as Tile[],
    firstRound: false,
    nextRack: 1,
    unseen: fives,
  };

  it("shows where the next player's best moves would score", () => {
    const danger = dangerMap(opened);
    // A 5 on the x3 above completes the trio for 90; on the x2 below, for 60.
    expect(danger[0]).toEqual({ cell: cellAt(1, 4), average: 90, most: 90 });
    expect(danger.find((d) => d.cell === cellAt(4, 4))).toEqual({ cell: cellAt(4, 4), average: 60, most: 60 });
    const averages = danger.map((d) => d.average);
    expect(averages).toEqual([...averages].sort((a, b) => b - a));
  });

  it("averages over the racks the next player might hold, the same way every time", () => {
    const real = { ...opened, unseen: undefined, nextRack: 3 };
    const first = dangerMap(real);
    expect(dangerMap(real)).toEqual(first);
    const top = first.find((d) => d.cell === cellAt(1, 4))!;
    expect(top.most).toBeGreaterThanOrEqual(90);
    expect(top.average).toBeLessThanOrEqual(top.most);
  });

  it("is empty when the next player has no tiles", () => {
    expect(dangerMap({ ...opened, nextRack: 0 })).toEqual([]);
  });
});

describe("reasons and grades", () => {
  const idea = (patch: Partial<Idea>): Idea => ({
    placements: [],
    cells: [],
    score: 30,
    replay: false,
    triolet: false,
    wild: false,
    reply: 20,
    open: 0,
    squares: 0,
    value: 10,
    ...patch,
  });

  it("explains what a move does better than another", () => {
    const better = idea({ score: 40, reply: 10, open: 3, triolet: true, replay: true });
    const worse = idea({ squares: 1, wild: true });
    expect(reasons(better, worse).map((r) => r.kind)).toEqual([
      "triolet",
      "points",
      "safer",
      "keepsOpen",
      "noSquare",
      "keepsWild",
      "replay",
    ]);
    expect(reasons(idea({}), idea({}))).toEqual([]);
  });

  it("grades a move by how far it falls short of the best idea", () => {
    const best = idea({ value: 50 });
    expect(grade(idea({ value: 48 }), best)).toBe("best");
    expect(grade(idea({ value: 40 }), best)).toBe("good");
    expect(grade(idea({ value: 25 }), best)).toBe("fair");
    expect(grade(idea({ value: 0 }), best)).toBe("weak");
  });
});
