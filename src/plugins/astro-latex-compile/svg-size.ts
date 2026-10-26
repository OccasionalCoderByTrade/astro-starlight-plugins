const POINTS_PER_EM = 10;

/**
 * Sizes a compiled tex diagram relative to the text around it. dvisvgm gives
 * the root `<svg>` a `width` and `height` in pt; each becomes em, with 10pt
 * (LaTeX's default font size) as 1em, so the compiled tex diagram's text
 * matches the body text whatever the reader's browser font size. A dimension
 * that isn't in pt is left as is. Expects markup from `scopeSvg`, which starts
 * at `<svg`. See docs/adr/0018-compiled-tex-diagrams-are-sized-in-em.md.
 */
export function sizeSvgInEm(svgMarkup: string): string {
  return svgMarkup.replace(/^<svg\b[^>]*>/, (rootTag) =>
    rootTag.replace(
      /(\s(?:width|height)=)(['"])(\d*\.?\d+)pt\2/g,
      (_match, attributeStart, quote, points) =>
        `${attributeStart}${quote}${pointsToEm(Number(points))}em${quote}`,
    ),
  );
}

/** Rounded to 4 decimals, trailing zeros dropped. */
function pointsToEm(points: number): string {
  return String(Number((points / POINTS_PER_EM).toFixed(4)));
}
