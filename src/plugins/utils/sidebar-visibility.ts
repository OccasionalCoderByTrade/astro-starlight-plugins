import { basename } from "node:path";

/** The frontmatter fields that decide whether a source doc is hidden from sidebar. */
export type TSidebarVisibilityFrontmatter = {
  draft?: boolean;
  sidebar?: { hidden?: boolean };
};

/** Whether a source doc with `frontmatter` is hidden from sidebar (`draft` or `sidebar.hidden`). */
export function isHiddenFromSidebar(
  frontmatter: TSidebarVisibilityFrontmatter,
): boolean {
  return Boolean(frontmatter.draft || frontmatter.sidebar?.hidden);
}

/**
 * Whether the file at `filePath` has a `_`-prefixed name, which Astro never turns into a
 * page. Only the filename counts: `_partials/page.md` is still a page.
 */
export function hasUnderscoreFileName(filePath: string): boolean {
  return basename(filePath).startsWith("_");
}
