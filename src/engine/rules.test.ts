import { describe, expect, it } from "vitest";
import {
  CELL_COUNT,
  CENTRE,
  LAYOUT,
  cellAt,
  evaluatePlacement,
  generateMoves,
  hasAnyMove,
  inFirstRound,
  makeTileSet,
  DISTRIBUTION,
  type PlacedTile,
  type Tile,
} from "./index";

const C = 7; // centre row and column

function board(values: Record<number, number> = {}): (PlacedTile | null)[] {
  const b: (PlacedTile | null)[] = Array(CELL_COUNT).fill(null);
  let id = 1000;
  for (const [cell, value] of Object.entries(values)) {
    b[Number(cell)] = { id: id++, value, wild: false, player: 0, turn: 0 };
  }
  return b;
}

const rack = (...faces: (number | null)[]): Tile[] => faces.map((face, id) => ({ id, face }));
const at = cellAt;

describe("tile set", () => {
  it("has 81 numbered tiles plus 2 wilds", () => {
    const tiles = makeTileSet();
    expect(tiles).toHaveLength(83);
    expect(tiles.filter((t) => t.face === null)).toHaveLength(2);
    for (let v = 0; v <= 15; v++) {
      expect(tiles.filter((t) => t.face === v)).toHaveLength(DISTRIBUTION[v]);
    }
    expect(new Set(tiles.map((t) => t.id)).size).toBe(83);
  });
});

describe("board layout", () => {
  it("matches the physical board (triolets Board.py, given as column, row)", () => {
    const squares: [number, number, string][] = [
      [7, 0, "replay"], [1, 1, "replay"], [4, 1, "triple"], [10, 1, "triple"], [13, 1, "replay"],
      [7, 3, "double"], [1, 4, "triple"], [4, 4, "double"], [10, 4, "double"], [13, 4, "triple"],
      [0, 7, "replay"], [3, 7, "double"], [7, 7, "centre"], [11, 7, "double"], [14, 7, "replay"],
      [1, 10, "triple"], [4, 10, "double"], [10, 10, "double"], [13, 10, "triple"], [7, 11, "double"],
      [1, 13, "replay"], [4, 13, "triple"], [10, 13, "triple"], [13, 13, "replay"], [7, 14, "replay"],
    ];
    const expected = Array(CELL_COUNT).fill("plain");
    for (const [col, row, kind] of squares) expected[at(row, col)] = kind;
    expect([...LAYOUT]).toEqual(expected);
    expect(LAYOUT[CENTRE]).toBe("centre");
  });
});

describe("evaluatePlacement", () => {
  it("requires the opening move to cover the centre", () => {
    const result = evaluatePlacement(board(), rack(7), [{ tileId: 0, cell: at(C, C + 1) }]);
    expect(result).toMatchObject({ ok: false, error: "mustCoverCentre" });
  });

  it("scores a lone opening tile double on the centre", () => {
    const result = evaluatePlacement(board(), rack(7), [{ tileId: 0, cell: CENTRE }]);
    expect(result).toMatchObject({ ok: true, score: 14 });
  });

  it("doubles only the tile on the centre in an opening pair", () => {
    const result = evaluatePlacement(board(), rack(7, 8), [
      { tileId: 0, cell: CENTRE },
      { tileId: 1, cell: at(C, C + 1) },
    ]);
    // 7 on the star counts 14, the 8 beside it counts 8.
    expect(result).toMatchObject({ ok: true, score: 22 });
  });

  it("awards a Triolet for three rack tiles making 15 in one go, unmultiplied", () => {
    const result = evaluatePlacement(board(), rack(4, 5, 6), [
      { tileId: 0, cell: at(C, C - 1) },
      { tileId: 1, cell: CENTRE },
      { tileId: 2, cell: at(C, C + 1) },
    ]);
    // (15 + 15 trio bonus) x 2 for the centre, then + 50 Triolet bonus.
    expect(result).toMatchObject({ ok: true, triolet: true, score: 110 });
  });

  it("rejects a pair over 15", () => {
    const result = evaluatePlacement(board({ [CENTRE]: 9 }), rack(7), [{ tileId: 0, cell: at(C, C + 1) }]);
    expect(result).toMatchObject({ ok: false, error: "pairOver" });
  });

  it("completes a trio worth 30", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
    const result = evaluatePlacement(b, rack(6), [{ tileId: 0, cell: at(C, C + 2) }]);
    expect(result).toMatchObject({ ok: true, score: 30, triolet: false });
  });

  it("rejects a trio that is not exactly 15", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
    const result = evaluatePlacement(b, rack(5), [{ tileId: 0, cell: at(C, C + 2) }]);
    expect(result).toMatchObject({ ok: false, error: "trioNot15" });
  });

  it("never allows four in a row", () => {
    const b = board({ [at(C, 5)]: 0, [at(C, 6)]: 0, [CENTRE]: 0 });
    const result = evaluatePlacement(b, rack(0), [{ tileId: 0, cell: at(C, 8) }]);
    expect(result).toMatchObject({ ok: false, error: "tooLong" });
  });

  it("requires tiles to touch the board, in one line, without gaps", () => {
    const b = board({ [CENTRE]: 5 });
    expect(evaluatePlacement(b, rack(1), [{ tileId: 0, cell: at(0, 0) }])).toMatchObject({
      error: "notConnected",
    });
    expect(
      evaluatePlacement(b, rack(1, 2), [
        { tileId: 0, cell: at(C, C + 1) },
        { tileId: 1, cell: at(C + 1, C + 2) },
      ]),
    ).toMatchObject({ error: "notInLine" });
    expect(
      evaluatePlacement(b, rack(1, 2), [
        { tileId: 0, cell: at(C, C + 1) },
        { tileId: 1, cell: at(C, C + 3) },
      ]),
    ).toMatchObject({ error: "gap" });
  });

  it("allows tiles either side of an existing tile", () => {
    const b = board({ [CENTRE]: 5 });
    const result = evaluatePlacement(b, rack(3, 7), [
      { tileId: 0, cell: at(C, C - 1) },
      { tileId: 1, cell: at(C, C + 1) },
    ]);
    expect(result).toMatchObject({ ok: true, score: 30 });
  });

  it("rejects tiles not on the rack, reused tiles and occupied cells", () => {
    const b = board({ [CENTRE]: 5 });
    expect(evaluatePlacement(b, rack(3), [{ tileId: 9, cell: at(C, C + 1) }])).toMatchObject({
      error: "notInRack",
    });
    expect(
      evaluatePlacement(b, rack(3), [
        { tileId: 0, cell: at(C, C + 1) },
        { tileId: 0, cell: at(C, C + 2) },
      ]),
    ).toMatchObject({ error: "duplicateTile" });
    expect(evaluatePlacement(b, rack(3), [{ tileId: 0, cell: CENTRE }])).toMatchObject({ error: "occupied" });
  });

  it("scores every group a tile joins, doubling only that tile in each pair", () => {
    // 8 above (4,4) and 7 left of it; a 3 on the double square (4,4) makes two pairs.
    const b = board({ [at(3, 4)]: 8, [at(4, 3)]: 7 });
    expect(LAYOUT[at(4, 4)]).toBe("double");
    const result = evaluatePlacement(b, rack(3), [{ tileId: 0, cell: at(4, 4) }]);
    // Each pair counts the 3 twice: (8 + 6) + (7 + 6).
    expect(result).toMatchObject({ ok: true, score: 27 });
    if (result.ok) expect(result.groups.map((g) => g.points).sort()).toEqual([13, 14]);
  });

  it("triples only the tile on the square in a pair", () => {
    expect(LAYOUT[at(1, 4)]).toBe("triple");
    const b = board({ [at(1, 5)]: 6 });
    const result = evaluatePlacement(b, rack(4), [{ tileId: 0, cell: at(1, 4) }]);
    expect(result).toMatchObject({ ok: true, score: 4 * 3 + 6 });
  });

  it("triples a whole trio completed this turn, bonus included", () => {
    const b = board({ [at(1, 5)]: 6, [at(1, 6)]: 5 });
    const result = evaluatePlacement(b, rack(4), [{ tileId: 0, cell: at(1, 4) }]);
    expect(result).toMatchObject({ ok: true, score: 90 });
  });

  it("never reuses a square once its tile is down", () => {
    // The 4 on the triple was placed on an earlier turn; completing the trio now scores a plain 30.
    const b = board({ [at(1, 4)]: 4, [at(1, 5)]: 6 });
    const result = evaluatePlacement(b, rack(5), [{ tileId: 0, cell: at(1, 6) }]);
    expect(result).toMatchObject({ ok: true, score: 30 });
  });

  it("flags a replay square", () => {
    expect(LAYOUT[at(1, 1)]).toBe("replay");
    const b = board({ [at(2, 1)]: 6 });
    const result = evaluatePlacement(b, rack(2), [{ tileId: 0, cell: at(1, 1) }]);
    expect(result).toMatchObject({ ok: true, replay: true, score: 8 });
  });

  describe("wilds", () => {
    it("need a value between 0 and 15", () => {
      const b = board({ [CENTRE]: 5 });
      expect(evaluatePlacement(b, rack(null), [{ tileId: 0, cell: at(C, C + 1) }])).toMatchObject({
        error: "wildValue",
      });
      expect(
        evaluatePlacement(b, rack(null), [{ tileId: 0, cell: at(C, C + 1), value: 16 }]),
      ).toMatchObject({ error: "wildValue" });
    });

    it("count their chosen value, so a trio with a wild is still worth 30", () => {
      const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
      const result = evaluatePlacement(b, rack(null), [{ tileId: 0, cell: at(C, C + 2), value: 6 }]);
      expect(result).toMatchObject({ ok: true, score: 30 });
    });

    it("cannot be played two at once", () => {
      const result = evaluatePlacement(board(), rack(null, null), [
        { tileId: 0, cell: CENTRE, value: 5 },
        { tileId: 1, cell: at(C, C + 1), value: 5 },
      ]);
      expect(result).toMatchObject({ ok: false, error: "twoWilds" });
    });

    it("cancel the Triolet bonus", () => {
      const result = evaluatePlacement(board(), rack(4, 5, null), [
        { tileId: 0, cell: at(C, C - 1) },
        { tileId: 1, cell: CENTRE },
        { tileId: 2, cell: at(C, C + 1), value: 6 },
      ]);
      expect(result).toMatchObject({ ok: true, triolet: false, score: 60 });
    });
  });
});

describe("no square in the first round", () => {
  const byNumber = (cells: number[]) => [...cells].sort((a, b) => a - b);

  it("refuses two tiles that would close a square of four", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
    const below = [
      { tileId: 0, cell: at(C + 1, C) },
      { tileId: 1, cell: at(C + 1, C + 1) },
    ];
    const result = evaluatePlacement(b, rack(3, 2), below, { noSquares: true });
    expect(result).toMatchObject({ ok: false, error: "earlySquare" });
    if (!result.ok) expect(byNumber(result.cells!)).toEqual(byNumber([CENTRE, at(C, C + 1), at(C + 1, C), at(C + 1, C + 1)]));
    // The same move is fine once the first round is over.
    expect(evaluatePlacement(b, rack(3, 2), below)).toMatchObject({ ok: true });
  });

  it("refuses a single tile that closes a square", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4, [at(C + 1, C)]: 3 });
    const result = evaluatePlacement(b, rack(2), [{ tileId: 0, cell: at(C + 1, C + 1) }], { noSquares: true });
    expect(result).toMatchObject({ ok: false, error: "earlySquare" });
  });

  it("still allows lines and L shapes", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
    expect(evaluatePlacement(b, rack(3), [{ tileId: 0, cell: at(C + 1, C) }], { noSquares: true })).toMatchObject({ ok: true });
    expect(evaluatePlacement(b, rack(6), [{ tileId: 0, cell: at(C, C - 1) }], { noSquares: true })).toMatchObject({ ok: true });
  });

  it("keeps squares out of the generated moves", () => {
    const b = board({ [CENTRE]: 5, [at(C, C + 1)]: 4 });
    const forms = (cells: number[]) =>
      cells.some((cell) =>
        [-1, 0].some((dr) =>
          [-1, 0].some((dc) => {
            const top = Math.floor(cell / 15) + dr;
            const left = (cell % 15) + dc;
            const block = [at(top, left), at(top, left + 1), at(top + 1, left), at(top + 1, left + 1)];
            return block.every((x) => cells.includes(x) || b[x] !== null);
          }),
        ),
      );
    const all = generateMoves(b, rack(3, 2, 1));
    const opening = generateMoves(b, rack(3, 2, 1), { noSquares: true });
    expect(all.some((m) => forms(m.evaluation.cells))).toBe(true);
    expect(opening.some((m) => forms(m.evaluation.cells))).toBe(false);
    expect(opening.length).toBeGreaterThan(0);
  });

  it("lasts until every player has had a turn, play again turns included", () => {
    const players = ["Ana", "Bob", "Cy"].map((name) => ({ name, kind: "human" as const, score: 0 }));
    const pass = (player: number) => ({ type: "pass" as const, player });
    expect(inFirstRound({ players, log: [] })).toBe(true);
    expect(inFirstRound({ players, log: [pass(0), pass(0), pass(1)] })).toBe(true);
    expect(inFirstRound({ players, log: [pass(0), pass(1), pass(2)] })).toBe(false);
  });
});

describe("generateMoves", () => {
  it("finds only legal moves, including the Triolet", () => {
    const moves = generateMoves(board(), rack(4, 5, 6));
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(m.evaluation.ok).toBe(true);
    expect(moves.some((m) => m.evaluation.triolet)).toBe(true);
    expect(Math.max(...moves.map((m) => m.evaluation.score))).toBe(110);
  });

  it("knows when a rack cannot be played", () => {
    const b = board({ [CENTRE]: 15 });
    expect(hasAnyMove(b, rack(15, 14, 1))).toBe(false);
    expect(hasAnyMove(b, rack(15, 14, 0))).toBe(true);
  });
});
