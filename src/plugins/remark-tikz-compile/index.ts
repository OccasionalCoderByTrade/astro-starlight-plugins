/**
 * Remark plugin that compiles fenced `tikzcompile` code blocks to SVG.
 *
 * Usage:
 *   import { remarkTikzCompile } from "...";
 *
 *   // In astro.config.mjs:
 *   markdown: {
 *     remarkPlugins: [
 *       [remarkTikzCompile, { svgOutputDir: "public/static/tex-svgs" }],
 *     ],
 *   }
 */
import { resolve } from "node:path";
import { compileLatexToSvg } from "./compile.js";

export interface RemarkTikzCompileOptions {
  /**
   * Directory where SVG files should be written.
   * @default "public/static/tex-svgs"
   */
  svgOutputDir?: string;
}

function traverseTree(node: any, svgOutputDir: string, depth: number = 0): void {
  if (!node) return;

  // Process children first (bottom-up traversal for safe replacement)
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === "code" && (child.lang === "tex" || child.lang === "latex") && child.meta?.includes("compile")) {
        try {
          // Compile and get the result
          const result = compileLatexToSvg(child.value, svgOutputDir);
          // Replace with paragraph containing image
          node.children[i] = {
            type: "paragraph",
            children: [
              {
                type: "image",
                url: `/static/tex-svgs/${result.hash}.svg`,
                alt: "TikZ diagram",
              },
            ],
          };
        } catch (err) {
          console.error(`[remarkTikzCompile] Failed to compile TikZ code block:`, err);
          // Leave code block as-is if compilation fails
        }
      } else {
        // Recurse into non-code children
        traverseTree(child, svgOutputDir, depth + 1);
      }
    }
  }
}

export default function remarkTikzCompile(options?: RemarkTikzCompileOptions) {
  const svgOutputDir = options?.svgOutputDir
    ? resolve(options.svgOutputDir)
    : resolve("public/static/tex-svgs");

  return (tree: any) => {
    traverseTree(tree, svgOutputDir, 0);
  };
}

export { compileLatexToSvg };
export { starlightTikzCompile } from "./starlight-plugin.js";
