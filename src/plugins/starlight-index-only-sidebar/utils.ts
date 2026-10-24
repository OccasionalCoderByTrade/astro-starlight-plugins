import * as fs from "node:fs";
import * as path from "node:path";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryBadge,
  sidebarEntryLabel,
  type TSidebarEntryFrontmatter,
} from "../utils/sidebar-labels.js";
import type { TSidebarItem } from "../utils/sidebar-types.js";
import { isHiddenFromSidebar } from "../utils/sidebar-visibility.js";
import { parseFrontmatter } from "../utils/workspace-utils.js";

const SOURCE_DOC_EXTENSIONS = [".md", ".mdx"];

type TOptions = {
  maxDepthNesting?: number;
  dirnameDeterminesLabels?: boolean;
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

function getSlug(dirPath: string, rootDir: string): string {
  const normalized = path.normalize(dirPath).replace(/\\/g, "/");
  const rootParent = path.normalize(path.dirname(rootDir)).replace(/\\/g, "/");

  const slug = normalized.startsWith(rootParent)
    ? normalized.slice(rootParent.length + 1)
    : normalized;
  return slug + "/index";
}

function hasIndexMdInSubtree(dirPath: string): boolean {
  const indexFilePath = findSidebarIndexFile(dirPath, SOURCE_DOC_EXTENSIONS);
  if (indexFilePath) {
    const frontmatter = parseFrontmatter(indexFilePath);
    return !isHiddenFromSidebar(frontmatter);
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;
    const entryPath = path.join(dirPath, entry);
    if (isDir(entryPath) && hasIndexMdInSubtree(entryPath)) {
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
  rootDir: string,
  currentDepth: number,
  maxDepth: number,
  dirnameDeterminesLabels: boolean,
  parentDirName: string = "",
): TSidebarItem[] {
  const items: TSidebarItem[] = [];

  // Add index.md of current directory if it exists
  const indexFilePath = findSidebarIndexFile(dirPath, SOURCE_DOC_EXTENSIONS);
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
        slug: getSlug(dirPath, rootDir),
        ...badgeProperty(frontmatter),
      });
    }
  }

  // If we've reached max depth, flatten all deeper index files
  if (currentDepth >= maxDepth) {
    const flattenedItems = flattenIndexFilesAtDepth(
      dirPath,
      rootDir,
      dirnameDeterminesLabels,
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
    if (!hasIndexMdInSubtree(entryPath)) continue;

    // Recursively build items for this subdirectory
    const subItems = buildSidebarItems(
      entryPath,
      rootDir,
      currentDepth + 1,
      maxDepth,
      dirnameDeterminesLabels,
      entry,
    );

    // Apply truncation: if no index.md in this dir, promote children instead of wrapping
    const hasIndex =
      findSidebarIndexFile(entryPath, SOURCE_DOC_EXTENSIONS) !== null;
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
  rootDir: string,
  dirnameDeterminesLabels: boolean,
): TSidebarItem[] {
  const items: TSidebarItem[] = [];

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    const indexFilePath = findSidebarIndexFile(
      entryPath,
      SOURCE_DOC_EXTENSIONS,
    );
    if (indexFilePath) {
      const frontmatter = readEntryFrontmatter(indexFilePath);
      if (!isHiddenFromSidebar(frontmatter)) {
        items.push({
          label: pathSegmentToLabel(entry),
          slug: getSlug(entryPath, rootDir),
          ...badgeProperty(frontmatter),
        });
      }
    }

    // Recursively search deeper directories
    items.push(
      ...flattenIndexFilesAtDepth(entryPath, rootDir, dirnameDeterminesLabels),
    );
  }

  return items;
}

export function getIndexMdSidebarItems(
  directory: string,
  options: TOptions = {},
): TSidebarItem[] {
  if (!isDir(directory)) {
    throw new Error(
      `[starlight-index-only-sidebar] Directory not found: "${path.resolve(directory)}"`,
    );
  }
  const maxDepth = options.maxDepthNesting ?? 100;
  const dirnameDeterminesLabels = options.dirnameDeterminesLabels ?? true;
  const rootGroupLabel = pathSegmentToLabel(path.basename(directory));

  const items = buildSidebarItems(
    directory,
    directory,
    0,
    maxDepth,
    dirnameDeterminesLabels,
  );

  return [
    {
      label: rootGroupLabel,
      items,
    },
  ];
}
