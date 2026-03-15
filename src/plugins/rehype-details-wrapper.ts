import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

// Rehype plugin: wraps the contents of <details> elements (except for <summary>) in a `div.details-wrapper` element
export function rehypeDetailsWrapper() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "details") {
        if (!node.children || node.children.length === 0) {
          return;
        }

        try {
          // Find the summary element and all other children
          const summaryIndex = node.children.findIndex(
            (child) => child.type === "element" && (child as Element).tagName === "summary"
          );

          if (summaryIndex === -1) {
            // No summary found, wrap all children
            const wrapper: Element = {
              type: "element",
              tagName: "div",
              properties: { className: ["details-wrapper"] },
              children: [...node.children],
            };
            node.children = [wrapper];
          } else {
            // Summary exists, wrap everything except the summary
            const summary = node.children[summaryIndex];
            const beforeSummary = node.children.slice(0, summaryIndex);
            const afterSummary = node.children.slice(summaryIndex + 1);

            // Combine content before and after summary (excluding summary itself)
            const contentToWrap = [...beforeSummary, ...afterSummary];

            if (contentToWrap.length > 0) {
              const wrapper: Element = {
                type: "element",
                tagName: "div",
                properties: { className: ["details-wrapper"] },
                children: contentToWrap,
              };

              // Reconstruct children: summary first, then wrapped content
              node.children = [summary, wrapper];
            } else {
              // Only summary exists, keep as is
              node.children = [summary];
            }
          }
        } catch (error) {
          //
        }
      }
    });
  };
}

export default rehypeDetailsWrapper;
