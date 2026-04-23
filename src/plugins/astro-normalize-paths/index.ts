import { existsSync } from "fs";
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "glob";
import { dirname, resolve } from "path";
import type { AstroIntegration } from "astro";

/**
 * Astro integration that normalizes img src and anchor href attributes to absolute paths in HTML files after build.
 * This processes resources in Starlight docs that aren't handled by the rehype plugin.
 *
 * Handles the case where Astro converts markdown files into index.html files in subdirectories,
 * which changes the relative path structure.
 */
export function astroNormalizePaths(): AstroIntegration {
  return {
    name: "astro-normalize-paths",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const htmlFiles = await glob(`${dir.pathname}/**/*.html`);

        await Promise.all(
          htmlFiles.map(async (htmlFile) => {
            let content = await readFile(htmlFile, "utf-8");
            const originalContent = content;

            // Normalize img src attributes
            const imgRegex = /<img([^>]*?)src=["']([^"']+)["']/g;
            let match;

            while ((match = imgRegex.exec(content)) !== null) {
              const attrs = match[1];
              const src = match[2];

              const normalized = normalizeAssetPath(src, htmlFile, dir.pathname);
              if (normalized && src !== normalized) {
                console.log(`[astro-normalize-paths] Img path resolution:`);
                console.log(`  Original: ${src}`);
                console.log(`  HTML file: ${htmlFile}`);
                console.log(`  Normalized: ${normalized}`);
                content = content.replace(`<img${attrs}src="${src}"`, `<img${attrs}src="${normalized}"`);
              }
            }

            // Normalize anchor href attributes
            const anchorRegex = /<a([^>]*?)href=["']([^"']+)["']/g;

            while ((match = anchorRegex.exec(content)) !== null) {
              const attrs = match[1];
              const href = match[2];

              const normalized = normalizeAssetPath(href, htmlFile, dir.pathname);
              if (normalized && href !== normalized) {
                content = content.replace(`<a${attrs}href="${href}"`, `<a${attrs}href="${normalized}"`);
              }
            }

            if (content !== originalContent) {
              await writeFile(htmlFile, content, "utf-8");
            }
          }),
        );
      },
    },
  };
}

/**
 * Normalize a relative asset path to an absolute site path.
 * Handles Astro's transformation of markdown files into index.html files in subdirectories.
 *
 * For example:
 * - Source: notes/lecture-11-on-03-04.md with reference to assets/file.svg
 * - Built: notes/lecture-11-on-03-04/index.html
 * - The relative path "assets/file.svg" needs to become "../assets/file.svg"
 * - Which resolves to /notes/assets/file.svg (absolute)
 */
function normalizeAssetPath(
  path: string,
  htmlFile: string,
  siteRootPath: string
): string | null {
  // Skip external URLs, data URIs, and already absolute paths
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("/")) {
    return null;
  }

  const htmlDir = dirname(htmlFile);
  const resolvedPath = resolve(htmlDir, path);
  const siteRoot = resolve(siteRootPath);

  // Try the direct resolution first
  let absolutePath = resolvedPath.slice(siteRoot.length).replace(/\\/g, "/");

  // If the direct resolution doesn't exist as a file, try going up one level
  // This handles the case where Astro created an index.html in a subdirectory
  if (!existsSync(resolvedPath)) {
    const parentDir = dirname(htmlDir);
    const alternativePath = resolve(parentDir, path);

    if (existsSync(alternativePath)) {
      absolutePath = alternativePath.slice(siteRoot.length).replace(/\\/g, "/");
    }
  }

  // Ensure single leading slash
  const finalPath = "/" + absolutePath.replace(/^\/+/, "");
  return finalPath;
}

export default astroNormalizePaths;
