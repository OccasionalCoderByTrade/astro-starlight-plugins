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

