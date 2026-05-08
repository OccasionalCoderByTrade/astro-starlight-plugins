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
            const left = /\w/.test(term[0]) ? "\\b" : "(?<!\\S)";
            const right = /\w/.test(term[term.length - 1]) ? "\\b" : "(?!\\S)";
            const regex = new RegExp(
              `${left}${escapeRegex(term)}${right}`,
              "g",
            );
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
