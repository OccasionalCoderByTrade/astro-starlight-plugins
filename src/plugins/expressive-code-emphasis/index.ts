import {
  definePlugin,
  ExpressiveCodeAnnotation,
  type AnnotationRenderOptions,
} from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";

class EmphasisAnnotation extends ExpressiveCodeAnnotation {
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => h("span.fw-supreme", [node]));
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expressiveCodeEmphasis() {
  return definePlugin({
    name: "expressiveCodeEmphasis",
    hooks: {
      preprocessCode: (context) => {
        const emphValue = context.codeBlock.metaOptions.getString("emph");
        const terms = emphValue
          ? emphValue
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
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
