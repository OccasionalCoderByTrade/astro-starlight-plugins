import {
  definePlugin,
  ExpressiveCodeAnnotation,
  type AnnotationRenderOptions,
} from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";
import { createEmphasisMatcher } from "./utils.js";

class EmphasisAnnotation extends ExpressiveCodeAnnotation {
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => h("span.fw-supreme", [node]));
  }
}

/**
 * Expressive Code plugin that emphasizes the terms listed in a code block's
 * `emph` meta, e.g. ```` ```js emph="foo,bar,()" ````, by wrapping each match
 * in `<span class="fw-supreme">`. The `.fw-supreme` styles ship in the
 * package's `./styles` export.
 *
 * - Terms are comma-separated and trimmed; a term can't contain a comma.
 * - Matching is case-sensitive.
 * - A term edge that is a letter, digit or `_` (Unicode-aware) can't sit
 *   against another one, so `foo` doesn't match in `food` or `naïve` doesn't
 *   leak `na`. A punctuation edge can sit against anything, so `()` matches
 *   in `foo()`.
 * - Matches never overlap: the one that starts first wins, and at the same
 *   start the longer term wins (`foo.bar` over `foo`).
 */
export function expressiveCodeEmphasis() {
  return definePlugin({
    name: "expressive-code-emphasis",
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
