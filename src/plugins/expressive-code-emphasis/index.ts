import {
  definePlugin,
  ExpressiveCodeAnnotation,
  type AnnotationRenderOptions,
} from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";

class EmphasisAnnotation extends ExpressiveCodeAnnotation {
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => h("span.bold-supreme", [node]));
  }
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
    hooks: {
      preprocessCode: (context) => {
        const terms = parseEmphTerms(context.codeBlock.meta);
        if (terms.length === 0) return;

        for (const line of context.codeBlock.getLines()) {
          for (const term of terms) {
            let searchFrom = 0;
            while (true) {
              const index = line.text.indexOf(term, searchFrom);
              if (index === -1) break;
              line.addAnnotation(
                new EmphasisAnnotation({
                  inlineRange: {
                    columnStart: index,
                    columnEnd: index + term.length,
                  },
                }),
              );
              searchFrom = index + term.length;
            }
          }
        }
      },
    },
  });
}
