/**
 * Remark plugin that compiles fenced `tex compile` or `latex compile` code blocks to SVG.
 *
 * Usage:
 *   import { remarkLatexCompile } from "...";
 *
 *   // In astro.config.mjs:
 *   markdown: {
 *     remarkPlugins: [
 *       [remarkLatexCompile, { svgOutputDir: "public/static/example-out-dir" }],
 *     ],
 *   }
 */
import { resolve } from "node:path";
import { compileLatexToSvg } from "./compile.js";

export interface RemarkLatexCompileOptions {
  /**
   * Directory where SVG files should be written.
   */
  svgOutputDir: string;
}

/**
 * Extract class names from meta string.
 * Looks for class="..." attribute in the meta string.
 * Example: "compile class=\"bg-white rounded-1\"" returns ["bg-white", "rounded-1"]
 */
function extractClassesFromMeta(meta: string): string[] {
  const classMatch = meta.match(/class="([^"]+)"/);
  if (classMatch && classMatch[1]) {
    return classMatch[1].split(/\s+/).filter(Boolean);
  }
  return [];
}

function traverseTree(
  node: Record<string, unknown>,
  svgOutputDir: string,
  filePath: string,
  depth: number = 0,
): void {
  if (!node) return;

  // Process children first (bottom-up traversal for safe replacement)
  const children = node.children as Array<Record<string, unknown>>;
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (
        child.type === "code" &&
        (child.lang === "tex" || child.lang === "latex") &&
        String(child.meta || "").includes("compile")
      ) {
        const position = child.position as Record<string, unknown> | undefined;
        const lineNumber =
          (position?.start as Record<string, unknown>)?.line || "?";

        try {
          // Compile and get the result
          const result = compileLatexToSvg(String(child.value), svgOutputDir);
          if (result.wasCompiled) {
            console.log(
              `[remark-latex-compile] ${filePath}:${lineNumber}: compiled ${result.hash}.svg`,
            );
          }

          // Extract custom classes from meta string
          const customClasses = extractClassesFromMeta(
            String(child.meta || ""),
          );
          const allClasses = ["tex-compiled", ...customClasses];

          // Replace with paragraph containing image
          children[i] = {
            type: "paragraph",
            children: [
              {
                type: "image",
                url: `/static/tex-svgs/${result.hash}.svg`,
                alt: "LaTeX diagram",
                data: {
                  hProperties: {
                    className: allClasses,
                  },
                },
              },
            ],
          };
        } catch (err) {
          // Don't throw—leave code block as-is so page renders.
          // In dev mode, log the error without the wrapper since Astro will also display it.
          // In build mode, the astro integration will catch and fail the build.
          if (process.env.NODE_ENV !== "production") {
            const errorMsg = err instanceof Error ? err.message : String(err);
            // Extract just the formatted error (after the wrapper line)
            const match = errorMsg.match(/\n\n([\s\S]+)/);
            const details = match ? match[1] : errorMsg;
            console.error(`${filePath}:${lineNumber}\n${details}`);
          }
        }
      } else {
        // Recurse into non-code children
        traverseTree(child, svgOutputDir, filePath, depth + 1);
      }
    }
  }
}

export default function remarkLatexCompile(options: RemarkLatexCompileOptions) {
  const svgOutputDir = resolve(options.svgOutputDir);

  return (tree: Record<string, unknown>, file: unknown) => {
    // Get file path from file metadata, default to 'unknown' if not available
    const fileObj = file as Record<string, unknown> | undefined;
    const filePath = String(fileObj?.path || fileObj?.filename || "unknown");
    traverseTree(tree, svgOutputDir, filePath, 0);
  };
}

export { compileLatexToSvg };
export { starlightLatexCompile } from "./starlight-plugin.js";
export { rehypeLatexCompile } from "./rehype-converter.js";
