import { parseFrontmatter as astroParseFrontmatter } from "@astrojs/markdown-remark";
import type { AstroIntegrationLogger } from "astro";
import * as fs from "node:fs";
import * as path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import { pathSegmentToLabel } from "../utils/sidebar-labels.js";
import { toSidebarSlug } from "../utils/sidebar-slugs.js";
import type {
  TSidebarBadge,
  TSidebarGroup,
  TSidebarItem,
} from "../utils/sidebar-types.js";
import {
  hasUnderscoreFileName,
  isHiddenFromSidebar,
} from "../utils/sidebar-visibility.js";
import { isFile } from "../utils/workspace-utils.js";

type TFrontmatter = {
  title?: string;
  slug?: string;
  draft?: boolean;
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
  /** Levels of groups allowed, the root group included; deeper groups are flattened. */
  maxGroupLevels: number;
  indexMarker: TSidebarBadge | undefined;
  collapsed: boolean;
  /** Extensions that make a file a source doc, from `getSourceDocExtensions`. */
  sourceDocExtensions: string[];
  /** Where skipped-link warnings go: the logger Starlight passes to `config:setup`. */
  logger: AstroIntegrationLogger;
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

function hasSourceDocExtension(
  filePath: string,
  sourceDocExtensions: string[],
): boolean {
  return sourceDocExtensions.includes(path.extname(filePath));
}

function findSourceDoc(
  extensionlessFilePath: string,
  sourceDocExtensions: string[],
): string | null {
  for (const extension of sourceDocExtensions) {
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
  sourceDocExtensions: string[],
): string | null {
  const resolvedFilePath = path.resolve(fromDirPath, hrefPath);

  // An href that already carries a source doc extension names that exact file
  if (hasSourceDocExtension(hrefPath, sourceDocExtensions)) {
    return isFile(resolvedFilePath) ? resolvedFilePath : null;
  }

  return findSourceDoc(resolvedFilePath, sourceDocExtensions);
}

/** Warns that `href`, as written in the sidebar index at `indexFilePath`, gives no entry. */
function warnSkippedLink(
  options: TBuildItemsOptions,
  indexFilePath: string,
  href: string,
  reason: string,
): void {
  const docsRelativeIndexFilePath = path
    .relative(options.docsDirPath, indexFilePath)
    .replace(/\\/g, "/");
  options.logger.warn(
    `[starlight-index-sourced-sidebar] Skipped link "${href}" in ${docsRelativeIndexFilePath}: ${reason}`,
  );
}

function buildItems(options: TBuildItemsOptions): TSidebarItem[] {
  const {
    docsDirPath,
    dirPath,
    currentDepth,
    maxGroupLevels,
    visitedDirPaths,
    indexMarker,
    collapsed,
    sourceDocExtensions,
  } = options;

  if (visitedDirPaths.has(dirPath)) return [];
  visitedDirPaths.add(dirPath);

  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (!indexFilePath) {
    throw new Error(
      `[starlight-index-sourced-sidebar] No sidebar index (index${sourceDocExtensions.join(", index")}) found in "${dirPath}"`,
    );
  }

  const indexDoc = readSourceDoc(indexFilePath);
  if (isHiddenFromSidebar(indexDoc.frontmatter)) return [];

  // The index page itself is always the first item in its group
  const items: TSidebarItem[] = [
    {
      label:
        indexDoc.frontmatter.title ??
        pathSegmentToLabel(path.basename(dirPath)),
      slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: indexFilePath,
        frontmatterSlug: indexDoc.frontmatter.slug,
      }),
      ...(indexMarker && { badge: indexMarker }),
    },
  ];

  for (const href of extractMarkdownLinks(indexDoc.body)) {
    if (isExternal(href)) continue;

    // Pure anchor links (#section) resolve to nothing, so skip them
    const hrefPath = href.split("?")[0].split("#")[0].trim();
    if (!hrefPath) continue;

    const resolvedFilePath = resolveSourceDoc(
      hrefPath,
      dirPath,
      sourceDocExtensions,
    );
    if (!resolvedFilePath) continue;

    if (hasUnderscoreFileName(resolvedFilePath)) {
      warnSkippedLink(
        options,
        indexFilePath,
        href,
        "files whose names start with `_` aren't pages",
      );
      continue;
    }

    const isSubIndex =
      hrefPath.endsWith("/index") ||
      sourceDocExtensions.some((extension) =>
        hrefPath.endsWith(`/index${extension}`),
      );

    if (isSubIndex && !resolvedFilePath.endsWith(".mdx")) {
      // index.md: recurse and build a group, or flatten it at the depth limit
      const subDirPath = path.dirname(resolvedFilePath);
      const subItems = buildItems({
        ...options,
        dirPath: subDirPath,
        currentDepth: currentDepth + 1,
      });
      if (subItems.length === 0) continue;

      // The root group is level 1, so the sub-index group would be level currentDepth + 2
      if (currentDepth + 2 > maxGroupLevels) {
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
        label:
          linkedDoc.frontmatter.title ??
          pathSegmentToLabel(path.basename(path.dirname(resolvedFilePath))),
        slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: resolvedFilePath,
        frontmatterSlug: linkedDoc.frontmatter.slug,
      }),
        ...(indexMarker && { badge: indexMarker }),
      });
      continue;
    }

    items.push({
      label:
        linkedDoc.frontmatter.title ??
        pathSegmentToLabel(
          path.basename(resolvedFilePath, path.extname(resolvedFilePath)),
        ),
      slug: toSidebarSlug({
        docsDirPath,
        sourceDocFilePath: resolvedFilePath,
        frontmatterSlug: linkedDoc.frontmatter.slug,
      }),
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
