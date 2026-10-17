import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, THEME_SCRIPT, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("reads saved settings", () => {
    const saved = { sound: false, volume: "high", theme: "dark", blink: false };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it("falls back to the defaults for anything missing, unknown or unreadable", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ volume: "deafening", theme: 3, sound: "yes" }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ theme: "light" }))).toEqual({ ...DEFAULT_SETTINGS, theme: "light" });
  });
});

describe("THEME_SCRIPT", () => {
  // The script runs in the page head; here it runs against a stand-in for the page.
  const run = (stored: string | null) => {
    const attributes: Record<string, string> = {};
    const page = {
      localStorage: { getItem: () => stored },
      document: { documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) } },
    };
    new Function("localStorage", "document", THEME_SCRIPT)(page.localStorage, page.document);
    return attributes["data-theme"];
  };

  it("applies a chosen theme and leaves automatic alone", () => {
    expect(run(JSON.stringify({ theme: "dark" }))).toBe("dark");
    expect(run(JSON.stringify({ theme: "light" }))).toBe("light");
    expect(run(JSON.stringify({ theme: "auto" }))).toBeUndefined();
    expect(run(null)).toBeUndefined();
    expect(run("{broken")).toBeUndefined();
  });
});
