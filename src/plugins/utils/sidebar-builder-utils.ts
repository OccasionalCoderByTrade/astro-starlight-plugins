import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type { TSidebarItem } from "./types";

type TOptions = {
  maxDepthNesting?: number;
  dirnameDeterminesLabels?: boolean;
};

type TFrontmatter = {
  title?: string;
  draft?: boolean;
  sidebar?: {
    hidden?: boolean;
  };
};

function isDir(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function findIndexMd(dirPath: string): string | null {
  const indexMd = path.join(dirPath, "index.md");
  const indexMdx = path.join(dirPath, "index.mdx");
  try {
    if (fs.statSync(indexMd).isFile()) return indexMd;
    if (fs.statSync(indexMdx).isFile()) return indexMdx;
  } catch {
    // continue
  }
  return null;
}

function parseFrontmatter(filePath: string): TFrontmatter {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter = parseYaml(match[1]);
    return typeof frontmatter === "object" && frontmatter ? frontmatter : {};
  } catch {
    return {};
  }
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
  const indexFile = findIndexMd(dirPath);
  if (indexFile) {
    const fm = parseFrontmatter(indexFile);
    if (fm.draft || fm.sidebar?.hidden) return false;
    return true;
  }

  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry === "assets") continue;
      const fullPath = path.join(dirPath, entry);
      if (isDir(fullPath) && hasIndexMdInSubtree(fullPath)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function isGroupItem(item: TSidebarItem): boolean {
  return "items" in item;
}

/**
 * Convert a directory path segment to a human-readable label
 * @param {string} pathSegment - A segment of the path (e.g., "csci-316")
 * @returns {string} - Human-readable label (e.g., "CSCI 316")
 */
function pathSegmentToLabel(pathSegment: string): string {
  let label = pathSegment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Handle pattern like "csci 316" -> uppercase first group
  const match = label.match(/^([a-z]+) [0-9]{2,}/i);
  if (match) {
    const firstGroup = match[1];
    const uppercasedFirstGroup = firstGroup.toUpperCase();
    label = uppercasedFirstGroup + label.substring(firstGroup.length);
  }

  return label;
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
  const indexFile = findIndexMd(dirPath);
  if (indexFile) {
    const fm = parseFrontmatter(indexFile);
    if (!fm.draft && !fm.sidebar?.hidden) {
      let label: string;
      if (currentDepth >= maxDepth && parentDirName) {
        // At max depth: flattened items use immediate parent directory name
        label = parentDirName;
      } else if (dirnameDeterminesLabels) {
        label = "Overview";
      } else {
        label = fm.title || "Overview";
      }

      items.push({
        label,
        slug: getSlug(dirPath, rootDir),
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
  try {
    const entries = fs.readdirSync(dirPath).sort();
    for (const entry of entries) {
      if (entry === "assets") continue;

      const fullPath = path.join(dirPath, entry);
      if (!isDir(fullPath)) continue;

      // Skip if this directory has no index.md in its subtree
      if (!hasIndexMdInSubtree(fullPath)) continue;

      // Recursively build items for this subdirectory
      const subItems = buildSidebarItems(
        fullPath,
        rootDir,
        currentDepth + 1,
        maxDepth,
        dirnameDeterminesLabels,
        entry,
      );

      // Apply truncation: if no index.md in this dir, promote children instead of wrapping
      const hasIndex = findIndexMd(fullPath) !== null;
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
  } catch {
    // Directory read error, return what we have
  }

  return items;
}

function flattenIndexFilesAtDepth(
  dirPath: string,
  rootDir: string,
  dirnameDeterminesLabels: boolean,
): TSidebarItem[] {
  const items: TSidebarItem[] = [];

  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry === "assets") continue;

      const fullPath = path.join(dirPath, entry);
      if (!isDir(fullPath)) continue;

      const indexFile = findIndexMd(fullPath);
      if (indexFile) {
        const fm = parseFrontmatter(indexFile);
        if (!fm.draft && !fm.sidebar?.hidden) {
          items.push({
            label: pathSegmentToLabel(entry),
            slug: getSlug(fullPath, rootDir),
          });
        }
      }

      // Recursively search deeper directories
      items.push(
        ...flattenIndexFilesAtDepth(fullPath, rootDir, dirnameDeterminesLabels),
      );
    }
  } catch {
    // continue
  }

  return items;
}

export function getIndexMdSidebarItems(
  directory: string,
  options: TOptions = {},
): TSidebarItem[] {
  const maxDepth = options.maxDepthNesting ?? 100;
  const dirnameDeterminesLabels = options.dirnameDeterminesLabels ?? true;
  const rootDirName = pathSegmentToLabel(path.basename(directory));

  const items = buildSidebarItems(
    directory,
    directory,
    0,
    maxDepth,
    dirnameDeterminesLabels,
  );

  return [
    {
      label: rootDirName,
      items,
    },
  ];
}
