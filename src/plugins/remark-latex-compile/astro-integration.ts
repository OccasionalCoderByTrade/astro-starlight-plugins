/**
 * Astro integration for remark-latex-compile.
 *
 * This integration handles compiling LaTeX diagrams from markdown source files
 * during the build process, since Starlight's content loader bypasses the standard Astro markdown pipeline.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import {
  compileLatexToSvg,
  hashLatexCode,
  LATEX_BLOCK_REGEX,
} from "./compile.js";

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
        console.log(
          "[astro-latex-compile] Build done, updating HTML references",
        );

        try {
          await updateHtmlReferences(dir.pathname, contentDir, svgOutputDir);
        } catch (err) {
          console.error(
            "[astro-latex-compile] Error updating HTML references:",
            err,
          );
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

async function updateHtmlReferences(
  buildDir: string,
  contentDir: string,
  svgOutputDir: string,
): Promise<void> {
  // Collect all LaTeX code blocks in order (with their computed hashes)
  const latexHashes: string[] = [];

  const entries = await readdir(contentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(contentDir, entry.name);
    if (entry.isDirectory()) {
      await scanMarkdownForHashes(fullPath, latexHashes);
    }
  }

  // Update HTML files with new hashes
  await updateHtmlDirWithHashes(buildDir, latexHashes, svgOutputDir);
}

async function scanMarkdownForHashes(
  dir: string,
  hashes: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanMarkdownForHashes(fullPath, hashes);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
    ) {
      const content = await readFile(fullPath, "utf-8");
      const latexBlockRegex = new RegExp(
        LATEX_BLOCK_REGEX.source,
        LATEX_BLOCK_REGEX.flags,
      );
      const matches = content.matchAll(latexBlockRegex);

      for (const match of matches) {
        const latexCode = match[1];
        const hash = hashLatexCode(latexCode);
        hashes.push(hash);
      }
    }
  }
}

async function updateHtmlDirWithHashes(
  dir: string,
  hashes: string[],
  svgOutputDir: string,
): Promise<void> {
  let hashIndex = 0;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await updateHtmlDirWithHashes(fullPath, hashes, svgOutputDir);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      let content = await readFile(fullPath, "utf-8");
      let modified = false;

      // Extract the HTML URL path from svgOutputDir (e.g., "/static/tex-svgs" from "public/static/tex-svgs")
      const pathSegments = svgOutputDir.split("/").slice(-2).join("/");
      const htmlPath = `/${pathSegments}`;
      const svgRegex = new RegExp(`src="${htmlPath}/[a-f0-9]+\\.svg"`, "g");

      // Replace each image src pointing to tex-svgs with the next computed hash
      content = content.replace(svgRegex, (match: string) => {
        if (hashIndex < hashes.length) {
          modified = true;
          return `src="${htmlPath}/${hashes[hashIndex++]}.svg"`;
        }
        return match;
      });

      if (modified) {
        await writeFile(fullPath, content, "utf-8");
        console.log(`[astro-latex-compile] Updated ${fullPath}`);
      }
    }
  }
}
