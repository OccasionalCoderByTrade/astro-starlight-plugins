import * as fs from "node:fs";
import * as path from "node:path";
import { buildSidebarEntry } from "../utils/sidebar-entries.js";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryLabel,
  type TSidebarEntryFrontmatter,
} from "../utils/sidebar-labels.js";
import type { TSidebarGroup, TSidebarItem } from "../utils/sidebar-types.js";
import { isHiddenFromSidebar } from "../utils/sidebar-visibility.js";
import {
  isDir,
  parseFrontmatter,
  type TSourceDocFrontmatter,
} from "../utils/workspace-utils.js";

type TFrontmatter = TSourceDocFrontmatter & TSidebarEntryFrontmatter;

export type TIndexOnlySidebarOptions = {
  /** Absolute path of Starlight's docs root (`content/docs/` under Astro's `srcDir`). */
  docsDirPath: string;
  /** Levels of groups allowed, the root group included. `Infinity` for no limit. */
  maxGroupLevels: number;
  /** @default true */
  dirnameDeterminesLabels?: boolean;
  /** Extensions that make a file a source doc, from `getSourceDocExtensions`. */
  sourceDocExtensions: string[];
};

/** What every level of the recursion shares. */
type TBuildItemsOptions = Required<TIndexOnlySidebarOptions>;

function hasSidebarIndexInSubtree(
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
    if (
      isDir(entryPath) &&
      hasSidebarIndexInSubtree(entryPath, sourceDocExtensions)
    ) {
      return true;
    }
  }
  return false;
}

function isGroupItem(item: TSidebarItem): boolean {
  return "items" in item;
}

/**
 * The items of the group for `dirPath`, which sits at `groupLevel` (the root group is
 * level 1). At the group level limit, deeper sidebar indexes are flattened into it.
 */
function buildSidebarItems(
  dirPath: string,
  groupLevel: number,
  options: TBuildItemsOptions,
  parentDirName: string = "",
): TSidebarItem[] {
  const { docsDirPath, sourceDocExtensions } = options;
  const isAtGroupLevelLimit = groupLevel >= options.maxGroupLevels;
  const items: TSidebarItem[] = [];

  // The sidebar index of the current directory, if it has one
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (indexFilePath) {
    const frontmatter = parseFrontmatter<TFrontmatter>(indexFilePath);
    if (!isHiddenFromSidebar(frontmatter)) {
      let label: string;
      if (isAtGroupLevelLimit && parentDirName) {
        // At the limit: flattened items use the immediate parent directory name
        label = parentDirName;
      } else if (options.dirnameDeterminesLabels) {
        label = "Overview";
      } else {
        label = sidebarEntryLabel(frontmatter, "Overview");
      }

      items.push(
        buildSidebarEntry({
          label,
          docsDirPath,
          sourceDocFilePath: indexFilePath,
          frontmatter,
        }),
      );
    }
  }

  // At the limit, flatten every deeper sidebar index into this group
  if (isAtGroupLevelLimit) {
    items.push(...flattenSidebarIndexesBelow(dirPath, options));
    return items;
  }

  // Process subdirectories
  const entries = fs.readdirSync(dirPath).sort();
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    // Skip if this directory has no sidebar index in its subtree
    if (!hasSidebarIndexInSubtree(entryPath, sourceDocExtensions)) continue;

    const subItems = buildSidebarItems(
      entryPath,
      groupLevel + 1,
      options,
      entry,
    );

    // A directory without a sidebar index promotes its children instead of wrapping them
    const hasSidebarIndex =
      findSidebarIndexFile(entryPath, sourceDocExtensions) !== null;
    if (!hasSidebarIndex) {
      const allGroups = subItems.length > 0 && subItems.every(isGroupItem);
      if (allGroups || (subItems.length === 1 && isGroupItem(subItems[0]))) {
        items.push(...subItems);
      } else {
        items.push({
          label: pathSegmentToLabel(entry),
          items: subItems,
        });
      }
    } else {
      items.push({
        label: pathSegmentToLabel(entry),
        items: subItems,
      });
    }
  }

  return items;
}

/** One entry per visible sidebar index below `dirPath`, labelled from its directory name. */
function flattenSidebarIndexesBelow(
  dirPath: string,
  options: TBuildItemsOptions,
): TSidebarItem[] {
  const { docsDirPath, sourceDocExtensions } = options;
  const items: TSidebarItem[] = [];

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    const indexFilePath = findSidebarIndexFile(entryPath, sourceDocExtensions);
    if (indexFilePath) {
      const frontmatter = parseFrontmatter<TFrontmatter>(indexFilePath);
      if (!isHiddenFromSidebar(frontmatter)) {
        items.push(
          buildSidebarEntry({
            label: pathSegmentToLabel(entry),
            docsDirPath,
            sourceDocFilePath: indexFilePath,
            frontmatter,
          }),
        );
      }
    }

    // Recursively search deeper directories
    items.push(...flattenSidebarIndexesBelow(entryPath, options));
  }

  return items;
}

/**
 * The root group for `dirPath`, or undefined when its sidebar index is hidden from sidebar
 * (a hidden root sidebar index takes its whole root group with it, like any other).
 */
export function getIndexOnlySidebarGroup(
  dirPath: string,
  options: TIndexOnlySidebarOptions,
): TSidebarGroup | undefined {
  const rootIndexFilePath = findSidebarIndexFile(
    dirPath,
    options.sourceDocExtensions,
  );
  if (
    rootIndexFilePath &&
    isHiddenFromSidebar(parseFrontmatter(rootIndexFilePath))
  ) {
    return undefined;
  }

  const items = buildSidebarItems(dirPath, 1, {
    ...options,
    dirnameDeterminesLabels: options.dirnameDeterminesLabels ?? true,
  });

  return {
    label: pathSegmentToLabel(path.basename(dirPath)),
    items,
  };
}
