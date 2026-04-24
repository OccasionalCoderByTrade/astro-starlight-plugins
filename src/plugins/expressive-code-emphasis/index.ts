import {
  definePlugin,
  ExpressiveCodeAnnotation,
  type AnnotationRenderOptions,
} from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";

const css = String.raw;

class EmphasisAnnotation extends ExpressiveCodeAnnotation {
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => h("span.fw-supreme", [node]));
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseEmphTerms(meta: string): string[] {
  const match = meta.match(/\bemph="([^"]+)"/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function expressiveCodeEmphasis() {
  return definePlugin({
    name: "expressiveCodeEmphasis",
    baseStyles: css`
      @import url("https://fonts.googleapis.com/css2?family=Open+Sans:wght@700;800&display=swap");

      .fw-supreme {
        font-family: "Open Sans", sans-serif;
        font-weight: 800;
      }

      html:not([data-theme="light"]) .fw-supreme > span {
        color: var(--sl-color-white);
      }
    `,
    hooks: {
      preprocessCode: (context) => {
        const terms = parseEmphTerms(context.codeBlock.meta);
        if (terms.length === 0) return;

        for (const line of context.codeBlock.getLines()) {
          for (const term of terms) {
            const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, "g");
            for (const match of line.text.matchAll(regex)) {
              line.addAnnotation(
                new EmphasisAnnotation({
                  inlineRange: {
                    columnStart: match.index,
                    columnEnd: match.index + term.length,
                  },
                }),
              );
            }
          }
        }
      },
    },
  });
}
