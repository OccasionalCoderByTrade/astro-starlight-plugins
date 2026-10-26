import { describe, expect, it } from "vitest";
import { sizeSvgInEm } from "./svg-size.js";

describe("sizeSvgInEm", () => {
  it("sizes the root svg in em, 10pt to 1em", () => {
    const sized = sizeSvgInEm(
      `<svg version='1.1' width='128.984538pt' height='9pt' viewBox='-72 -72 128.984538 9'><g/></svg>`,
    );

    expect(sized).toBe(
      `<svg version='1.1' width='12.8985em' height='0.9em' viewBox='-72 -72 128.984538 9'><g/></svg>`,
    );
  });

  it("drops the decimals of a whole em", () => {
    expect(sizeSvgInEm(`<svg width='10pt' height='20.00004pt'>`)).toBe(
      `<svg width='1em' height='2em'>`,
    );
  });

  it("leaves a malformed pt dimension as is", () => {
    const svg = `<svg width='1.2.3pt' height='4pt'><g/></svg>`;

    expect(sizeSvgInEm(svg)).toBe(
      `<svg width='1.2.3pt' height='0.4em'><g/></svg>`,
    );
  });

  it("leaves a dimension that isn't in pt as is", () => {
    const svg = `<svg width='100%' height='40px' viewBox='0 0 10 4'><g/></svg>`;

    expect(sizeSvgInEm(svg)).toBe(svg);
  });

  it("leaves a root svg without dimensions as is", () => {
    const svg = `<svg viewBox='0 0 10 4'><rect width='5pt' height='2pt'/></svg>`;

    expect(sizeSvgInEm(svg)).toBe(svg);
  });
});
