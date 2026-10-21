import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Test helper: a fresh project root holding `files` (relative path → contents), with the
 * docs and public dirs a Starlight site uses.
 */
export function makeSite(files: Record<string, string> = {}) {
  const rootDirPath = mkdtempSync(join(tmpdir(), "local-links-site-"));
  for (const [relativeFilePath, contents] of Object.entries(files)) {
    const filePath = join(rootDirPath, relativeFilePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return {
    rootDirPath,
    docsDirPath: join(rootDirPath, "src/content/docs"),
    publicDirPath: join(rootDirPath, "public"),
    generatedPathPrefixes: ["/_image", "/_astro/", "/@"],
  };
}

/** Test helper: a page whose source doc rendered `content`, inside Starlight's `chrome`. */
export function pageHtml(content: string, chrome = ""): string {
  return (
    `<!DOCTYPE html><html><head></head><body><nav>${chrome}</nav>` +
    `<div class="sl-markdown-content">${content}</div></body></html>`
  );
}
