/**
 * Rehype plugin to convert tex compile code blocks to images.
 * Runs after markdown rendering to replace `<pre><code class="language-tex">` blocks
 * that contain LaTeX compile instructions with `<img>` tags pointing to pre-compiled SVGs.
 */
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";
import type { VFile } from "vfile";
import { hashLatexCode } from "./utils.js";

export function rehypeLatexCompile() {
  return (tree: Root, _file: VFile) => {
    visit(tree, "element", (node: Element, index, parent) => {
      // Look for code blocks: <pre><code class="language-tex">...</code></pre>
      if (node.tagName !== "pre") return;

      const codeChild = node.children?.[0] as Element | undefined;
      if (!codeChild || codeChild.tagName !== "code") return;

      const classes = Array.isArray(codeChild.properties?.className)
        ? (codeChild.properties.className as string[])
        : [];

      // Check if it's a tex/latex code block
      if (
        !classes.includes("language-tex") &&
        !classes.includes("language-latex")
      ) {
        return;
      }

      // Extract the code content from the code block
      const codeContent = codeChild.children
        ?.map((child: any) =>
          typeof child === "string" ? child : child.value || "",
        )
        .join("")
        .trim();

      if (!codeContent) return;

      // Check if it's a compile block (has "compile" in the data attribute or content)
      const dataAttribute = codeChild.properties?.["data-meta"] as
        | string
        | undefined;
      const isCompileBlock =
        (dataAttribute && dataAttribute.includes("compile")) ||
        codeContent.includes("compile");

      if (!isCompileBlock) return;

      // Compute the hash of the LaTeX code
      try {
        const hash = hashLatexCode(codeContent);
        const svgPath = `/static/tex-svgs/${hash}.svg`;

        // Replace the pre block with an img element wrapped in a paragraph
        const imgElement: Element = {
          type: "element",
          tagName: "img",
          properties: {
            src: svgPath,
            alt: "LaTeX diagram",
            className: ["tex-compiled"],
          },
          children: [],
        };

        const paragraphElement: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [imgElement],
        };

        if (parent && typeof index === "number") {
          (parent as any).children[index] = paragraphElement;
        }
      } catch (err) {
        // If hashing fails, leave the code block as-is
        console.error(
          `[rehype-latex-compile] Error processing code block:`,
          err,
        );
      }
    });
  };
}

export default rehypeLatexCompile;
