import { describe, it, expect } from "vitest";
import { sourceRect, isValidRect, normalizeRect } from "../lib/crop.js";

const rect = { x: 100, y: 50, width: 400, height: 200 };

describe("sourceRect", () => {
  it("returns the rectangle unchanged at device pixel ratio 1", () => {
    expect(sourceRect(rect, 1)).toEqual({ sx: 100, sy: 50, sw: 400, sh: 200 });
  });

  it("scales every coordinate at device pixel ratio 2 and 3", () => {
    expect(sourceRect(rect, 2)).toEqual({ sx: 200, sy: 100, sw: 800, sh: 400 });
    expect(sourceRect(rect, 3)).toEqual({ sx: 300, sy: 150, sw: 1200, sh: 600 });
  });
});

describe("isValidRect", () => {
  it("rejects a rectangle smaller than the minimum size", () => {
    expect(isValidRect({ x: 0, y: 0, width: 5, height: 5 })).toBe(false);
    expect(isValidRect({ x: 0, y: 0, width: 50, height: 50 })).toBe(true);
  });
});

describe("normalizeRect", () => {
  it("normalises an upward and leftward drag to positive width and height", () => {
    expect(normalizeRect({ x: 100, y: 100, width: -40, height: -30 })).toEqual({
      x: 60,
      y: 70,
      width: 40,
      height: 30,
    });
  });
});
