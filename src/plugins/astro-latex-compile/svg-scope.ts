/**
 * Makes a dvisvgm SVG safe to inline next to other SVGs on one page. Inline
 * SVGs share the page's id space and stylesheet, so dvisvgm's ids, class names
 * (`f0`, `f1`, ...) and `@font-face` families (`cmr10`, holding only the
 * glyphs this compiled tex diagram uses) would collide across compiled tex diagrams. Each one gets
 * `prefix` prepended. The XML prolog and comments before `<svg` are dropped.
 */
export function scopeSvg(svgMarkup: string, prefix: string): string {
  const svgStart = svgMarkup.indexOf("<svg");
  const svgElement = svgStart > 0 ? svgMarkup.slice(svgStart) : svgMarkup;

  const ids = new Set(captures(svgElement, /\sid=['"]([^'"]+)['"]/g));
  const classNames = new Set(
    captures(svgElement, /\sclass=['"]([^'"]+)['"]/g).flatMap(splitClassList),
  );
  const fontFamilies = new Set(
    captures(svgElement, /@font-face\s*\{[^}]*?font-family:\s*([^;}\s]+)/g),
  );

  return svgElement
    .replace(
      /(\sid=)(['"])([^'"]+)\2/g,
      (_match, attribute, quote, id) =>
        `${attribute}${quote}${prefix}${id}${quote}`,
    )
    .replace(
      /(\s(?:xlink:)?href=)(['"])#([^'"]+)\2/g,
      (match, attribute, quote, id) =>
        ids.has(id) ? `${attribute}${quote}#${prefix}${id}${quote}` : match,
    )
    .replace(/url\(#([^)]+)\)/g, (match, id) =>
      ids.has(id) ? `url(#${prefix}${id})` : match,
    )
    .replace(
      /(\sclass=)(['"])([^'"]+)\2/g,
      (_match, attribute, quote, classList: string) => {
        const scopedClassList = splitClassList(classList)
          .map((className) => `${prefix}${className}`)
          .join(" ");
        return `${attribute}${quote}${scopedClassList}${quote}`;
      },
    )
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (styleElement) =>
      styleElement
        .replace(/\.([A-Za-z_][\w-]*)/g, (match, className) =>
          classNames.has(className) ? `.${prefix}${className}` : match,
        )
        .replace(/(font-family:\s*)([^;}\s]+)/g, (match, property, family) =>
          fontFamilies.has(family) ? `${property}${prefix}${family}` : match,
        ),
    );
}

function captures(markup: string, pattern: RegExp): string[] {
  return [...markup.matchAll(pattern)].map((match) => match[1]);
}

function splitClassList(classList: string): string[] {
  return classList.split(/\s+/).filter(Boolean);
}
