/**
 * Astro integration for remark-tikz-compile.
 *
 * This integration handles compiling TikZ diagrams from markdown source files
 * during the build process, since Starlight's content loader bypasses the standard Astro markdown pipeline.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { compileTikzToSvg } from "./compile.js";
import { createHash } from "node:crypto";

function hashTikzCode(code: string): string {
  const normalized = code
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  return createHash("md5")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

export interface AstroTikzCompileOptions {
  svgOutputDir?: string;
  contentDir?: string;
}

export function createAstroTikzIntegration(options?: AstroTikzCompileOptions) {
  const svgOutputDir = options?.svgOutputDir
    ? resolve(options.svgOutputDir)
    : resolve("public/static/tex-svgs");

  const contentDir = options?.contentDir
    ? resolve(options.contentDir)
    : resolve("src/content/docs");

  return {
    name: "astro-tikz-compile",
    hooks: {
      "astro:build:start": async () => {
        console.log("[astro-tikz-compile] Build start, scanning for tikzcompile blocks");

        try {
          await scanAndCompileTikz(contentDir, svgOutputDir);
        } catch (err) {
          console.error("[astro-tikz-compile] Error during TikZ compilation:", err);
        }
      },
      "astro:build:done": async ({ dir }: any) => {
        console.log("[astro-tikz-compile] Build done, updating HTML references");

        try {
          await updateHtmlReferences(dir.pathname, contentDir, svgOutputDir);
        } catch (err) {
          console.error("[astro-tikz-compile] Error updating HTML references:", err);
        }
      },
    },
  };
}

async function scanAndCompileTikz(
  dir: string,
  svgOutputDir: string
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      await scanAndCompileTikz(fullPath, svgOutputDir);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (ext === ".md" || ext === ".mdx") {
        await processMarkdownFile(fullPath, svgOutputDir);
      }
    }
  }
}

async function processMarkdownFile(
  filePath: string,
  svgOutputDir: string
): Promise<void> {
  const content = await readFile(filePath, "utf-8");

  // Match tikzcompile blocks: ```tikzcompile\n...\n```
  const tikzBlockRegex = /```tikzcompile\n([\s\S]*?)\n```/g;
  const matches = content.matchAll(tikzBlockRegex);

  for (const match of matches) {
    const tikzCode = match[1];
    try {
      const result = compileTikzToSvg(tikzCode, svgOutputDir);
      console.log(
        `[astro-tikz-compile] ${filePath}: compiled to ${result.hash}.svg`
      );
    } catch (err) {
      console.error(
        `[astro-tikz-compile] Failed to compile TikZ in ${filePath}:`,
        err
      );
    }
  }
}

async function updateHtmlReferences(
  buildDir: string,
  contentDir: string,
  svgOutputDir: string
): Promise<void> {
  // Collect all TikZ code blocks in order (with their computed hashes)
  const tikzHashes: string[] = [];

  const entries = await readdir(contentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(contentDir, entry.name);
    if (entry.isDirectory()) {
      await scanMarkdownForHashes(fullPath, tikzHashes);
    }
  }


  // Update HTML files with new hashes
  await updateHtmlDirWithHashes(buildDir, tikzHashes);
}

async function scanMarkdownForHashes(
  dir: string,
  hashes: string[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanMarkdownForHashes(fullPath, hashes);
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
      const content = await readFile(fullPath, "utf-8");
      const tikzBlockRegex = /```tikzcompile\n([\s\S]*?)\n```/g;
      const matches = content.matchAll(tikzBlockRegex);

      for (const match of matches) {
        const tikzCode = match[1];
        const hash = hashTikzCode(tikzCode);
        hashes.push(hash);
      }
    }
  }
}

async function updateHtmlDirWithHashes(
  dir: string,
  hashes: string[]
): Promise<void> {
  let hashIndex = 0;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await updateHtmlDirWithHashes(fullPath, hashes);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      let content = await readFile(fullPath, "utf-8");
      let modified = false;

      // Replace each image src pointing to tex-svgs with the next computed hash
      content = content.replace(
        /src="\/static\/tex-svgs\/[a-f0-9]+\.svg"/g,
        () => {
          if (hashIndex < hashes.length) {
            modified = true;
            return `src="/static/tex-svgs/${hashes[hashIndex++]}.svg"`;
          }
          return arguments[0];
        }
      );

      if (modified) {
        await writeFile(fullPath, content, "utf-8");
        console.log(`[astro-tikz-compile] Updated ${fullPath}`);
      }
    }
  }
}
