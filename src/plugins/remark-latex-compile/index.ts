/**
 * Remark plugin that compiles fenced `tex compile` or `latex compile` code blocks to SVG.
 *
 * Usage:
 *   import { remarkLatexCompile } from "...";
 *
 *   // In astro.config.mjs:
 *   markdown: {
 *     remarkPlugins: [
 *       [remarkLatexCompile, { svgOutputDir: "public/static/tex-svgs" }],
 *     ],
 *   }
 */
import { resolve } from "node:path";
import { visit, SKIP } from "unist-util-visit";
import type { Code, Image, Paragraph, Parent, Root } from "mdast";
import type { VFile } from "vfile";
import { compileLatexToSvg } from "./utils.js";

export interface RemarkLatexCompileOptions {
  /**
   * Directory where SVG files should be written.
   * Must be inside `public/` so Astro serves them as static assets.
   */
  svgOutputDir: string;
}

function extractClassesFromMeta(meta: string): string[] {
  const classMatch = meta.match(/class="([^"]+)"/);
  if (classMatch?.[1]) {
    return classMatch[1].split(/\s+/).filter(Boolean);
  }
  return [];
}

export default function remarkLatexCompile(options: RemarkLatexCompileOptions) {
  const svgOutputDir = resolve(options.svgOutputDir);

  return async function transformer(tree: Root, file: VFile) {
    type NodeEntry = { node: Code; index: number; parent: Parent };
    const nodes: NodeEntry[] = [];

    visit(tree, "code", (node, index, parent) => {
      if (
        (node.lang === "tex" || node.lang === "latex") &&
        node.meta?.includes("compile") &&
        parent &&
        index !== undefined
      ) {
        nodes.push({ node, index, parent });
      }
      return SKIP;
    });

    if (nodes.length === 0) return;

    const filePath = file.path || "unknown";

    // Compile all blocks in parallel, collecting results before mutating the tree
    const results = await Promise.all(
      nodes.map(async ({ node, index, parent }) => {
        const lineNumber = node.position?.start.line ?? "?";
        try {
          const result = await compileLatexToSvg(node.value, svgOutputDir);
          if (result.wasCompiled) {
            console.log(
              `[remark-latex-compile] ${filePath}:${lineNumber}: compiled ${result.hash}.svg`,
            );
          }
          return { index, parent, result, error: null };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const match = errorMsg.match(/\n\n([\s\S]+)/);
          const details = match ? match[1] : errorMsg;
          console.error(`[remark-latex-compile] ${filePath}:${lineNumber}\n${details}`);
          return { index, parent, result: null, error: err };
        }
      }),
    );

    // Apply AST mutations in reverse index order so earlier splices don't shift
    // the indices of later nodes sharing the same parent.
    for (let i = results.length - 1; i >= 0; i--) {
      const { index, parent, result } = results[i];
      const { node } = nodes[i];
      if (!result) continue;

      const customClasses = extractClassesFromMeta(node.meta ?? "");

      const imageNode: Image = {
        type: "image",
        url: `/static/tex-svgs/${result.hash}.svg`,
        alt: "LaTeX diagram",
        data: { hProperties: { className: ["tex-compiled", ...customClasses] } },
      };

      const paragraph: Paragraph = {
        type: "paragraph",
        children: [imageNode],
      };

      parent.children.splice(index, 1, paragraph);
    }
  };
}

export { compileLatexToSvg };
export { rehypeLatexCompile } from "./rehype-converter.js";
