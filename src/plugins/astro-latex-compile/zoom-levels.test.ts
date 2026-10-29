import { describe, expect, it } from "vitest";
import { scrollOffsetAfterZoom, zoomIn, zoomOut } from "./zoom-levels.js";

describe("zoom levels", () => {
  it("zooms in by 1.25x per step, stopping at 8x", () => {
    const zoomLevels = [1];
    while (zoomLevels.length < 12) zoomLevels.push(zoomIn(zoomLevels.at(-1)!));

    expect(zoomLevels.slice(0, 4)).toEqual([1, 1.25, 1.5625, 1.953125]);
    expect(zoomLevels.slice(9)).toEqual([7.450580596923828, 8, 8]);
  });

  it("zooms out by 1.25x per step, stopping at 1x", () => {
    // Back down the same levels zooming in went up.
    expect(zoomOut(8)).toBe(7.450580596923828);
    expect(zoomOut(7.450580596923828)).toBe(5.9604644775390625);
    expect(zoomOut(1.5625)).toBe(1.25);
    expect(zoomOut(1.1)).toBe(1);
    expect(zoomOut(1)).toBe(1);
  });

  it("keeps the point at the center of the visible area in place", () => {
    // At 2x, a 400px viewport scrolled 100px is centered on 150px of the 1x diagram.
    expect(
      scrollOffsetAfterZoom(
        { scrollOffset: 100, viewportSize: 400, padding: 0 },
        { fromZoom: 2, toZoom: 4 },
      ),
    ).toBe(400);
  });

  it("keeps the center in place when the viewport has padding", () => {
    // At 2x, 16px padding: the 400px viewport's center sits at (100 + 200 - 16) / 2 = 142px of the 1x diagram.
    // At 4x that is 568px into the diagram, 584px into the content; centered in the viewport.
    expect(
      scrollOffsetAfterZoom(
        { scrollOffset: 100, viewportSize: 400, padding: 16 },
        { fromZoom: 2, toZoom: 4 },
      ),
    ).toBe(384);
  });

  it("never scrolls before the start of the diagram", () => {
    expect(
      scrollOffsetAfterZoom(
        { scrollOffset: 100, viewportSize: 400, padding: 0 },
        { fromZoom: 2, toZoom: 1 },
      ),
    ).toBe(0);
  });
});
