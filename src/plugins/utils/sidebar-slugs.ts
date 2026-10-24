import { relative } from "node:path";
import { toSourceDocPagePath } from "./page-paths.js";

/**
 * The slug Starlight knows a source doc by: its frontmatter `slug:` when present, otherwise
 * its page path (each segment slugified, a trailing `/index` dropped), so
 * `<docsDirPath>/reference/My Page.md` → `reference/my-page`.
 */
export function toSidebarSlug({
  docsDirPath,
  sourceDocFilePath,
  frontmatterSlug,
}: {
  /** Absolute path of Starlight's docs root. */
  docsDirPath: string;
  /** Absolute path of the source doc. */
  sourceDocFilePath: string;
  /** The source doc's frontmatter `slug:`, if any. */
  frontmatterSlug: unknown;
}): string {
  if (typeof frontmatterSlug === "string") return frontmatterSlug;
  return toSourceDocPagePath(relative(docsDirPath, sourceDocFilePath));
}
