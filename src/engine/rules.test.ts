import { describe, expect, it } from "vitest";
import {
  CELL_COUNT,
  CENTRE,
  LAYOUT,
  cellAt,
  evaluatePlacement,
  generateMoves,
  hasAnyMove,
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
  it("is symmetric with the centre counting double", () => {
    expect(LAYOUT[CENTRE]).toBe("centre");
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(LAYOUT[at(r, c)]).toBe(LAYOUT[at(c, r)]);
        expect(LAYOUT[at(r, c)]).toBe(LAYOUT[at(14 - r, 14 - c)]);
      }
    }
    const count = (kind: string) => LAYOUT.filter((s) => s === kind).length;
    expect([count("triple"), count("double"), count("replay")]).toEqual([12, 12, 12]);
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

  it("scores an opening pair through the centre at double", () => {
    const result = evaluatePlacement(board(), rack(7, 8), [
      { tileId: 0, cell: CENTRE },
      { tileId: 1, cell: at(C, C + 1) },
    ]);
    expect(result).toMatchObject({ ok: true, score: 30 });
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

  it("scores every group a tile joins, applying the square to each", () => {
    // 8 above (6,6) and 7 left of it; a 0 on (6,6), a double square, makes two pairs.
    const b = board({ [at(5, 6)]: 8, [at(6, 5)]: 7, [CENTRE]: 1 });
    expect(LAYOUT[at(6, 6)]).toBe("double");
    const result = evaluatePlacement(b, rack(0), [{ tileId: 0, cell: at(6, 6) }]);
    expect(result).toMatchObject({ ok: true, score: (8 + 7) * 2 });
    if (result.ok) expect(result.groups).toHaveLength(2);
  });

  it("triples a whole trio, bonus included", () => {
    expect(LAYOUT[at(5, 5)]).toBe("triple");
    const b = board({ [at(5, 6)]: 6, [at(5, 7)]: 5 });
    const result = evaluatePlacement(b, rack(4), [{ tileId: 0, cell: at(5, 5) }]);
    expect(result).toMatchObject({ ok: true, score: 90 });
  });

  it("flags a replay square", () => {
    expect(LAYOUT[at(4, 6)]).toBe("replay");
    const b = board({ [at(5, 6)]: 6 });
    const result = evaluatePlacement(b, rack(2), [{ tileId: 0, cell: at(4, 6) }]);
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
