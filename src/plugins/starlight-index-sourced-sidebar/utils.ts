import { parseFrontmatter as astroParseFrontmatter } from "@astrojs/markdown-remark";
import * as fs from "node:fs";
import * as path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryBadge,
  sidebarEntryLabel,
  type TSidebarEntryFrontmatter,
} from "../utils/sidebar-labels.js";
import { toSidebarSlug } from "../utils/sidebar-slugs.js";
import type {
  TSidebarBadge,
  TSidebarGroup,
  TSidebarItem,
} from "../utils/sidebar-types.js";
import { isHiddenFromSidebar as hasHiddenFromSidebarFlag } from "../utils/sidebar-visibility.js";
import { isFile } from "../utils/workspace-utils.js";

const SOURCE_DOC_EXTENSIONS = [".md", ".mdx"];

type TFrontmatter = TSidebarEntryFrontmatter & {
  slug?: string;
  draft?: boolean;
  pagefind?: boolean;
  sidebar?: { hidden?: boolean };
};

/** A source doc's frontmatter and body, from one read. */
type TSourceDoc = {
  frontmatter: TFrontmatter;
  body: string;
};

export type TIndexSourcedSidebarOptions = {
  /** Absolute path of Starlight's docs root (`content/docs/` under Astro's `srcDir`). */
  docsDirPath: string;
  /** Absolute path of the directory whose sidebar index defines the root group. */
  dirPath: string;
  /** Depth at which sub-index groups are flattened into their parent; the root is 0. */
  maxDepthNesting: number;
  indexMarker: TSidebarBadge | undefined;
  collapsed: boolean;
};

/** Internal: what each level of the recursion needs on top of the public options. */
type TBuildItemsOptions = TIndexSourcedSidebarOptions & {
  currentDepth: number;
  visitedDirPaths: Set<string>;
};

/** Throws when the file can't be read or its YAML is malformed. */
function readSourceDoc(filePath: string): TSourceDoc {
  const content = fs.readFileSync(filePath, "utf-8");
  try {
    const { frontmatter, content: body } = astroParseFrontmatter(content);
    return { frontmatter: frontmatter as TFrontmatter, body };
  } catch (err) {
    throw new Error(
      `[starlight-index-sourced-sidebar] Failed to parse frontmatter in ${filePath}: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

// TODO(05): `pagefind: false` stops hiding entries, leaving the shared check alone
function isHiddenFromSidebar(frontmatter: TFrontmatter): boolean {
  return (
    hasHiddenFromSidebarFlag(frontmatter) || frontmatter.pagefind === false
  );
}

function findSourceDoc(extensionlessFilePath: string): string | null {
  for (const extension of SOURCE_DOC_EXTENSIONS) {
    const sourceDocFilePath = extensionlessFilePath + extension;
    if (isFile(sourceDocFilePath)) return sourceDocFilePath;
  }
  return null;
}

function extractMarkdownLinks(body: string): string[] {
  const tree = unified().use(remarkParse).parse(body);
  const hrefs: string[] = [];

  visit(tree, "link", (node) => {
    hrefs.push(node.url);
  });

  return hrefs;
}

function isExternal(href: string): boolean {
  return (
    /^https?:\/\//.test(href) ||
    href.startsWith("//") ||
    href.startsWith("mailto:")
  );
}

/** The source doc `hrefPath` points at from `fromDirPath`, or null when there's none. */
function resolveSourceDoc(
  hrefPath: string,
  fromDirPath: string,
): string | null {
  const resolvedFilePath = path.resolve(fromDirPath, hrefPath);

  // An href that already carries a source doc extension names that exact file
  if (/\.(mdx?)$/.test(hrefPath)) {
    return isFile(resolvedFilePath) ? resolvedFilePath : null;
  }

  return findSourceDoc(resolvedFilePath);
}

/** `{ badge }` to spread into an entry, or nothing when there's no badge. */
function badgeProperty(badge: TSidebarBadge | undefined) {
  return badge ? { badge } : {};
}

function buildItems(options: TBuildItemsOptions): TSidebarItem[] {
  const {
    docsDirPath,
    dirPath,
    currentDepth,
    maxDepthNesting,
    visitedDirPaths,
    indexMarker,
    collapsed,
  } = options;

  if (visitedDirPaths.has(dirPath)) return [];
  visitedDirPaths.add(dirPath);

  const indexFilePath = findSidebarIndexFile(dirPath, SOURCE_DOC_EXTENSIONS);
  if (!indexFilePath) {
    throw new Error(
      `[starlight-index-sourced-sidebar] No index.md or index.mdx found in "${dirPath}"`,
    );
  }

  const indexDoc = readSourceDoc(indexFilePath);
  if (isHiddenFromSidebar(indexDoc.frontmatter)) return [];

  // The index page itself is always the first item in its group
  const items: TSidebarItem[] = [
    {
      label: sidebarEntryLabel(
        indexDoc.frontmatter,
        pathSegmentToLabel(path.basename(dirPath)),
      ),
      slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: indexFilePath,
        frontmatterSlug: indexDoc.frontmatter.slug,
      }),
      ...badgeProperty(indexMarker ?? sidebarEntryBadge(indexDoc.frontmatter)),
    },
  ];

  for (const href of extractMarkdownLinks(indexDoc.body)) {
    if (isExternal(href)) continue;

    // Pure anchor links (#section) resolve to nothing, so skip them
    const hrefPath = href.split("?")[0].split("#")[0].trim();
    if (!hrefPath) continue;

    const resolvedFilePath = resolveSourceDoc(hrefPath, dirPath);
    if (!resolvedFilePath) continue;

    const isSubIndex =
      hrefPath.endsWith("/index") ||
      hrefPath.endsWith("/index.md") ||
      hrefPath.endsWith("/index.mdx");

    if (isSubIndex && !resolvedFilePath.endsWith(".mdx")) {
      // index.md: recurse and build a group, or flatten it at the depth limit
      const subDirPath = path.dirname(resolvedFilePath);
      const subItems = buildItems({
        ...options,
        dirPath: subDirPath,
        currentDepth: currentDepth + 1,
      });
      if (subItems.length === 0) continue;

      if (currentDepth + 1 >= maxDepthNesting) {
        items.push(...subItems);
      } else {
        items.push({
          label: pathSegmentToLabel(path.basename(subDirPath)),
          items: subItems,
          collapsed,
        });
      }
      continue;
    }

    const linkedDoc = readSourceDoc(resolvedFilePath);
    if (isHiddenFromSidebar(linkedDoc.frontmatter)) continue;

    if (isSubIndex) {
      // index.mdx: add as a single entry only, without recursing into it
      items.push({
        label: sidebarEntryLabel(
          linkedDoc.frontmatter,
          pathSegmentToLabel(path.basename(path.dirname(resolvedFilePath))),
        ),
        slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: resolvedFilePath,
        frontmatterSlug: linkedDoc.frontmatter.slug,
      }),
        ...badgeProperty(
          indexMarker ?? sidebarEntryBadge(linkedDoc.frontmatter),
        ),
      });
      continue;
    }

    items.push({
      label: sidebarEntryLabel(
        linkedDoc.frontmatter,
        pathSegmentToLabel(
          path.basename(resolvedFilePath, path.extname(resolvedFilePath)),
        ),
      ),
      slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: resolvedFilePath,
        frontmatterSlug: linkedDoc.frontmatter.slug,
      }),
      ...badgeProperty(sidebarEntryBadge(linkedDoc.frontmatter)),
    });
  }

  return items;
}

/**
 * The root group for `options.dirPath`, built from the links in its sidebar index, or
 * undefined when it has no entries (e.g. its sidebar index is hidden from sidebar).
 */
export function getIndexSourcedSidebarGroup(
  options: TIndexSourcedSidebarOptions,
): TSidebarGroup | undefined {
  const items = buildItems({
    ...options,
    currentDepth: 0,
    visitedDirPaths: new Set<string>(),
  });
  if (items.length === 0) return undefined;

  return {
    label: pathSegmentToLabel(path.basename(options.dirPath)),
    items,
    collapsed: options.collapsed,
  };
}
