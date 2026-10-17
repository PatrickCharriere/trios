import { describe, expect, it } from "vitest";
import { pollDelay } from "./client";

const MINUTE = 60_000;

describe("pollDelay", () => {
  it("checks often while the others play and gently on your own turn", () => {
    expect(pollDelay(true, null)).toBe(1500);
    expect(pollDelay(false, null)).toBe(8000);
  });

  it("keeps a background tab checking while waiting, slowing down, then stopping", () => {
    expect(pollDelay(true, 0)).toBe(6000);
    expect(pollDelay(true, 9 * MINUTE)).toBe(6000);
    expect(pollDelay(true, 10 * MINUTE)).toBe(MINUTE);
    expect(pollDelay(true, 119 * MINUTE)).toBe(MINUTE);
    expect(pollDelay(true, 120 * MINUTE)).toBeNull();
  });

  it("doesn't check from a background tab on your own turn", () => {
    expect(pollDelay(false, 0)).toBeNull();
  });
});
