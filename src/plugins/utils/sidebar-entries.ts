import {
  badgeProperty,
  sidebarEntryBadge,
  type TSidebarEntryFrontmatter,
} from "./sidebar-labels.js";
import { toSidebarSlug } from "./sidebar-slugs.js";
import type { TSidebarBadge, TSidebarEntry } from "./sidebar-types.js";
import type { TSourceDocFrontmatter } from "./workspace-utils.js";

/** The frontmatter fields a sidebar reads from a source doc it lists. */
export type TSidebarSourceDocFrontmatter = TSourceDocFrontmatter &
  TSidebarEntryFrontmatter;

/**
 * The sidebar entry for a source doc: `label`, the doc's slug (see `toSidebarSlug`) and its
 * badge, which is `badgeOverride` when set and otherwise the doc's `sidebar.badge`.
 */
export function buildSidebarEntry({
  label,
  docsDirPath,
  sourceDocFilePath,
  frontmatter,
  badgeOverride,
}: {
  label: string;
  /** Absolute path of Starlight's docs root. */
  docsDirPath: string;
  /** Absolute path of the source doc. */
  sourceDocFilePath: string;
  frontmatter: TSidebarSourceDocFrontmatter;
  /** Shown instead of the doc's `sidebar.badge` when set, like an index marker. */
  badgeOverride?: TSidebarBadge;
}): TSidebarEntry {
  return {
    label,
    slug: toSidebarSlug({
      docsDirPath,
      sourceDocFilePath,
      frontmatterSlug: frontmatter.slug,
    }),
    ...badgeProperty(badgeOverride ?? sidebarEntryBadge(frontmatter)),
  };
}
