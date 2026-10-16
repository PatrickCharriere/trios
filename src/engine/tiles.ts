import type { Tile } from "./types";

/** How many tiles of each value (index = value) the box contains: 81 in all. */
export const DISTRIBUTION = [9, 9, 8, 8, 7, 8, 6, 6, 4, 4, 3, 3, 2, 2, 1, 1] as const;
export const WILD_COUNT = 2;

export type Rng = () => number;

export function makeTileSet(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  DISTRIBUTION.forEach((count, face) => {
    for (let i = 0; i < count; i++) tiles.push({ id: id++, face });
  });
  for (let i = 0; i < WILD_COUNT; i++) tiles.push({ id: id++, face: null });
  return tiles;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Small seeded generator for reproducible tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points a tile is worth when left on a rack at the end: wilds count for nothing. */
export const rackValue = (tile: Tile) => tile.face ?? 0;
