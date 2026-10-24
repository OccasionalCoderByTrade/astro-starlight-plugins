import * as fs from "node:fs";
import * as path from "node:path";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryBadge,
  sidebarEntryLabel,
  type TSidebarEntryFrontmatter,
} from "../utils/sidebar-labels.js";
import { toSidebarSlug } from "../utils/sidebar-slugs.js";
import type { TSidebarItem } from "../utils/sidebar-types.js";
import { isHiddenFromSidebar } from "../utils/sidebar-visibility.js";
import { parseFrontmatter } from "../utils/workspace-utils.js";

type TOptions = {
  /** Levels of groups allowed, the root group included. @default Infinity */
  maxGroupLevels?: number;
  dirnameDeterminesLabels?: boolean;
  /** Extensions that make a file a source doc, from `getSourceDocExtensions`. */
  sourceDocExtensions: string[];
};

/** False when nothing is at `dirPath`; throws on any other stat error, such as EACCES. */
function isDir(dirPath: string): boolean {
  return (
    fs.statSync(dirPath, { throwIfNoEntry: false })?.isDirectory() ?? false
  );
}

/** A source doc's frontmatter, with the fields that decide its entry's label and badge. */
function readEntryFrontmatter(filePath: string) {
  return parseFrontmatter(filePath) as ReturnType<typeof parseFrontmatter> &
    TSidebarEntryFrontmatter;
}

/** `{ badge }` from `frontmatter`'s `sidebar.badge`, or nothing when it has none. */
function badgeProperty(frontmatter: TSidebarEntryFrontmatter) {
  const badge = sidebarEntryBadge(frontmatter);
  return badge ? { badge } : {};
}

function hasIndexMdInSubtree(
  dirPath: string,
  sourceDocExtensions: string[],
): boolean {
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (indexFilePath) {
    const frontmatter = parseFrontmatter(indexFilePath);
    return !isHiddenFromSidebar(frontmatter);
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;
    const entryPath = path.join(dirPath, entry);
    if (isDir(entryPath) && hasIndexMdInSubtree(entryPath, sourceDocExtensions)) {
      return true;
    }
  }
  return false;
}

function isGroupItem(item: TSidebarItem): boolean {
  return "items" in item;
}

function buildSidebarItems(
  dirPath: string,
  docsDirPath: string,
  currentDepth: number,
  maxDepth: number,
  dirnameDeterminesLabels: boolean,
  sourceDocExtensions: string[],
  parentDirName: string = "",
): TSidebarItem[] {
  const items: TSidebarItem[] = [];

  // Add index.md of current directory if it exists
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (indexFilePath) {
    const frontmatter = readEntryFrontmatter(indexFilePath);
    if (!isHiddenFromSidebar(frontmatter)) {
      let label: string;
      if (currentDepth >= maxDepth && parentDirName) {
        // At max depth: flattened items use immediate parent directory name
        label = parentDirName;
      } else if (dirnameDeterminesLabels) {
        label = "Overview";
      } else {
        label = sidebarEntryLabel(frontmatter, "Overview");
      }

      items.push({
        label,
        slug: toSidebarSlug({
          docsDirPath,
          sourceDocFilePath: indexFilePath,
          frontmatterSlug: frontmatter.slug,
        }),
        ...badgeProperty(frontmatter),
      });
    }
  }

  // If we've reached max depth, flatten all deeper index files
  if (currentDepth >= maxDepth) {
    const flattenedItems = flattenIndexFilesAtDepth(
      dirPath,
      docsDirPath,
      dirnameDeterminesLabels,
      sourceDocExtensions,
    );
    items.push(...flattenedItems);
    return items;
  }

  // Process subdirectories
  const entries = fs.readdirSync(dirPath).sort();
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    // Skip if this directory has no index.md in its subtree
    if (!hasIndexMdInSubtree(entryPath, sourceDocExtensions)) continue;

    // Recursively build items for this subdirectory
    const subItems = buildSidebarItems(
      entryPath,
      docsDirPath,
      currentDepth + 1,
      maxDepth,
      dirnameDeterminesLabels,
      sourceDocExtensions,
      entry,
    );

    // Apply truncation: if no index.md in this dir, promote children instead of wrapping
    const hasIndex =
      findSidebarIndexFile(entryPath, sourceDocExtensions) !== null;
    if (!hasIndex) {
      const allGroups = subItems.length > 0 && subItems.every(isGroupItem);
      if (allGroups || (subItems.length === 1 && isGroupItem(subItems[0]))) {
        items.push(...subItems);
      } else {
        // Create a group for this directory
        items.push({
          label: pathSegmentToLabel(entry),
          items: subItems,
        });
      }
    } else {
      // Create a group for this directory (has index.md)
      items.push({
        label: pathSegmentToLabel(entry),
        items: subItems,
      });
    }
  }

  return items;
}

function flattenIndexFilesAtDepth(
  dirPath: string,
  docsDirPath: string,
  dirnameDeterminesLabels: boolean,
  sourceDocExtensions: string[],
): TSidebarItem[] {
  const items: TSidebarItem[] = [];

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    const indexFilePath = findSidebarIndexFile(entryPath, sourceDocExtensions);
    if (indexFilePath) {
      const frontmatter = readEntryFrontmatter(indexFilePath);
      if (!isHiddenFromSidebar(frontmatter)) {
        items.push({
          label: pathSegmentToLabel(entry),
          slug: toSidebarSlug({
            docsDirPath,
            sourceDocFilePath: indexFilePath,
            frontmatterSlug: frontmatter.slug,
          }),
          ...badgeProperty(frontmatter),
        });
      }
    }

    // Recursively search deeper directories
    items.push(
      ...flattenIndexFilesAtDepth(
        entryPath,
        docsDirPath,
        dirnameDeterminesLabels,
        sourceDocExtensions,
      ),
    );
  }

  return items;
}

export function getIndexMdSidebarItems(
  docsDirPath: string,
  directory: string,
  options: TOptions,
): TSidebarItem[] {
  // The root directory is depth 0 and its group is level 1
  const maxDepth = (options.maxGroupLevels ?? Infinity) - 1;
  const dirnameDeterminesLabels = options.dirnameDeterminesLabels ?? true;
  const { sourceDocExtensions } = options;
  const rootGroupLabel = pathSegmentToLabel(path.basename(directory));

  // A hidden root sidebar index takes its whole root group with it, like any other
  const rootIndexFilePath = findSidebarIndexFile(directory, sourceDocExtensions);
  if (
    rootIndexFilePath &&
    isHiddenFromSidebar(parseFrontmatter(rootIndexFilePath))
  ) {
    return [];
  }

  const items = buildSidebarItems(
    directory,
    docsDirPath,
    0,
    maxDepth,
    dirnameDeterminesLabels,
    sourceDocExtensions,
  );

  return [
    {
      label: rootGroupLabel,
      items,
    },
  ];
}
