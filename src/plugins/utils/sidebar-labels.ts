import type { TSidebarBadge, TSidebarBadgeVariant } from "./sidebar-types.js";

/**
 * A sidebar label made from a path segment (a directory name, or a file name without its
 * extension): each `-`-separated word capitalized, and a leading word followed by a number
 * of 2+ digits upper-cased, e.g. `csci-316` becomes `CSCI 316`.
 */
export function pathSegmentToLabel(pathSegment: string): string {
  let label = pathSegment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const courseCodeMatch = label.match(/^([a-z]+) [0-9]{2,}/i);
  if (courseCodeMatch) {
    const courseCodeLetters = courseCodeMatch[1];
    label =
      courseCodeLetters.toUpperCase() +
      label.substring(courseCodeLetters.length);
  }

  return label;
}

/** The frontmatter fields that decide a sidebar entry's label and badge. */
export type TSidebarEntryFrontmatter = {
  title?: string;
  sidebar?: {
    label?: string;
    /** Starlight takes a string, or a `{ text, variant }` object. */
    badge?: string | { text: string; variant?: TSidebarBadgeVariant };
  };
};

/**
 * The label for the entry of a source doc with `frontmatter`: `sidebar.label`, then
 * `title`, then `fallbackLabel` (usually made from the filename).
 */
export function sidebarEntryLabel(
  frontmatter: TSidebarEntryFrontmatter,
  fallbackLabel: string,
): string {
  return frontmatter.sidebar?.label || frontmatter.title || fallbackLabel;
}

/**
 * The badge for the entry of a source doc with `frontmatter`, from its `sidebar.badge`, or
 * undefined when it has none. A string badge, or one without a `variant`, gets Starlight's
 * `default` variant.
 */
export function sidebarEntryBadge(
  frontmatter: TSidebarEntryFrontmatter,
): TSidebarBadge | undefined {
  const badge = frontmatter.sidebar?.badge;
  if (!badge) return undefined;
  if (typeof badge === "string") return { text: badge, variant: "default" };
  return { text: badge.text, variant: badge.variant ?? "default" };
}

/** `{ badge }` to spread into a sidebar entry, or nothing when there's no badge. */
export function badgeProperty(badge: TSidebarBadge | undefined) {
  return badge ? { badge } : {};
}
