import { readFileSync, writeFileSync } from "fs";
import { sync as globSync } from "glob";
import type { AstroIntegration } from "astro";
import { normalizePath } from "./utils/path-utils.js";

/**
 * Astro integration that normalizes img src and anchor href attributes to absolute paths in HTML files after build.
 * This processes resources in Starlight docs that aren't handled by the rehype plugin.
 */
export function astroNormalizePaths(): AstroIntegration {
  return {
    name: "astro-normalize-paths",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const htmlFiles = globSync(`${dir.pathname}/**/*.html`);

        for (const htmlFile of htmlFiles) {
          let content = readFileSync(htmlFile, "utf-8");
          const originalContent = content;

          // Normalize img src attributes
          const imgRegex = /<img([^>]*?)src=["']([^"']+)["']/g;
          let match;

          while ((match = imgRegex.exec(content)) !== null) {
            const attrs = match[1];
            const src = match[2];

            const normalized = normalizePath(src, htmlFile, dir.pathname);
            if (normalized && src !== normalized) {
              const oldTag = `<img${attrs}src="${src}"`;
              const newTag = `<img${attrs}src="${normalized}"`;
              content = content.replace(oldTag, newTag);
            }
          }

          // Normalize anchor href attributes
          const anchorRegex = /<a([^>]*?)href=["']([^"']+)["']/g;

          while ((match = anchorRegex.exec(content)) !== null) {
            const attrs = match[1];
            const href = match[2];

            const normalized = normalizePath(href, htmlFile, dir.pathname);
            if (normalized && href !== normalized) {
              const oldTag = `<a${attrs}href="${href}"`;
              const newTag = `<a${attrs}href="${normalized}"`;
              content = content.replace(oldTag, newTag);
            }
          }

          // Write back if content changed
          if (content !== originalContent) {
            writeFileSync(htmlFile, content, "utf-8");
          }
        }
      },
    },
  };
}

export default astroNormalizePaths;
