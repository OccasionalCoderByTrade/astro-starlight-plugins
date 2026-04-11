/**
 * Astro integration for remark-latex-compile.
 *
 * This integration handles compiling LaTeX diagrams from markdown source files
 * during the build process, since Starlight's content loader bypasses the standard Astro markdown pipeline.
 */
import { readdir, readFile, cp } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { compileLatexToSvg, LATEX_BLOCK_REGEX } from "./utils.js";

export interface AstroLatexCompileOptions {
  svgOutputDir: string;
  contentDir?: string;
}

export function createAstroLatexIntegration(options: AstroLatexCompileOptions) {
  const svgOutputDir = resolve(options.svgOutputDir);

  const contentDir = options?.contentDir
    ? resolve(options.contentDir)
    : resolve("src/content/docs");

  return {
    name: "astro-latex-compile",
    hooks: {
      "astro:build:start": async () => {
        console.log(
          "[astro-latex-compile] Build start, scanning for tex/latex compile blocks",
        );
        await scanAndCompileLatex(contentDir, svgOutputDir);
      },
      "astro:build:done": async ({ dir }: { dir: { pathname: string } }) => {
        // Copy SVGs from public/static/tex-svgs to the build output
        // This ensures SVGs created by the remark plugin are included in the final output
        const srcSvgDir = resolve(svgOutputDir);
        const outSvgDir = resolve(dir.pathname, "static/tex-svgs");
        try {
          await cp(srcSvgDir, outSvgDir, { recursive: true, force: true });
          console.log("[astro-latex-compile] Copied SVGs to build output");
        } catch (err) {
          console.error("[astro-latex-compile] Error copying SVGs:", err);
        }
      },
    },
  };
}

async function scanAndCompileLatex(
  dir: string,
  svgOutputDir: string,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      await scanAndCompileLatex(fullPath, svgOutputDir);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (ext === ".md" || ext === ".mdx") {
        console.log(`[astro-latex-compile] Found markdown file: ${fullPath}`);
        await processMarkdownFile(fullPath, svgOutputDir);
      }
    }
  }
}

/**
 * Calculate line number from string position (0-indexed)
 */
function getLineNumber(content: string, position: number): number {
  return content.substring(0, position).split("\n").length;
}

async function processMarkdownFile(
  filePath: string,
  svgOutputDir: string,
): Promise<void> {
  const content = await readFile(filePath, "utf-8");

  // Match tex/latex compile blocks: ```tex compile\n...\n``` or ```latex compile\n...\n```
  const latexBlockRegex = new RegExp(
    LATEX_BLOCK_REGEX.source,
    LATEX_BLOCK_REGEX.flags,
  );
  const matches = content.matchAll(latexBlockRegex);

  for (const match of matches) {
    const latexCode = match[1];
    const lineNumber = getLineNumber(content, match.index || 0);
    try {
      const result = compileLatexToSvg(latexCode, svgOutputDir);
      const status = result.wasCompiled ? "compiled" : "used cached";
      console.log(
        `[astro-latex-compile] ${filePath}:${lineNumber}: ${status} ${result.hash}.svg`,
      );
    } catch (err) {
      // Add file path and line number to the error message
      const error = err instanceof Error ? err : new Error(String(err));
      error.message = `${filePath}:${lineNumber}\n${error.message}`;
      throw error;
    }
  }
}
