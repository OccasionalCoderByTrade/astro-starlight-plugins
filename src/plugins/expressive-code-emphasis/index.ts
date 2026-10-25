import {
  definePlugin,
  ExpressiveCodeAnnotation,
  type AnnotationRenderOptions,
} from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";
import { sourceCodeProFontFaces } from "./fonts.js";
import { createEmphasisMatcher } from "./utils.js";

// `@font-face` survives Expressive Code's nesting of `baseStyles` under its wrapper class,
// but `@import` doesn't, so the font is inlined instead of linked from Google.
const sourceCodeProFontFaceRules = sourceCodeProFontFaces
  .map(
    ({ unicodeRange, woff2Base64 }) => `@font-face {
      font-family: "Source Code Pro";
      font-style: normal;
      font-weight: 900;
      font-display: swap;
      src: url(data:font/woff2;base64,${woff2Base64}) format("woff2");
      unicode-range: ${unicodeRange};
    }`,
  )
  .join("\n");

class EmphasisAnnotation extends ExpressiveCodeAnnotation {
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => h("span.fw-supreme", [node]));
  }
}

/**
 * Expressive Code plugin that emphasizes the terms listed in a code block's
 * `emph` meta, e.g. ```` ```js emph="foo,bar,()" ````, by wrapping each match
 * in `<span class="fw-supreme">`, styled in Source Code Pro at weight 900. The
 * styles and the font (latin + latin-ext subsets) ship with the plugin.
 *
 * - Terms are comma-separated and trimmed; a term can't contain a comma.
 * - Matching is case-sensitive.
 * - A term edge that is a word character (a letter, combining mark, digit or
 *   `_`, in any script) can't sit against another one, so `foo` doesn't match
 *   in `food` and `na` doesn't match in `naïve`. A punctuation edge can sit
 *   against anything, so `()` matches in `foo()`.
 * - Matches never overlap: the one that starts first wins, and at the same
 *   start the longer term wins (`foo.bar` over `foo`).
 */
export function expressiveCodeEmphasis() {
  return definePlugin({
    name: "expressive-code-emphasis",
    baseStyles: `
      ${sourceCodeProFontFaceRules}

      .fw-supreme {
        font-family: "Source Code Pro", ui-monospace, monospace;
        font-weight: 900;
        -webkit-text-stroke: 0.1px currentColor;
      }
    `,
    hooks: {
      preprocessCode: (context) => {
        const emphMetaValue = context.codeBlock.metaOptions.getString("emph");
        const terms = (emphMetaValue ?? "")
          .split(",")
          .map((term) => term.trim())
          .filter(Boolean);
        if (terms.length === 0) return;

        const findEmphasisRanges = createEmphasisMatcher(terms);
        for (const line of context.codeBlock.getLines()) {
          for (const inlineRange of findEmphasisRanges(line.text)) {
            line.addAnnotation(new EmphasisAnnotation({ inlineRange }));
          }
        }
      },
    },
  });
}
