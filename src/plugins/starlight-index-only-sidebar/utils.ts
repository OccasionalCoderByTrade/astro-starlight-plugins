import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildSidebarEntry,
  type TSidebarSourceDocFrontmatter,
} from "../utils/sidebar-entries.js";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryLabel,
} from "../utils/sidebar-labels.js";
import type {
  TSidebarEntry,
  TSidebarGroup,
  TSidebarItem,
} from "../utils/sidebar-types.js";
import { isHiddenFromSidebar } from "../utils/sidebar-visibility.js";
import { isDir, parseFrontmatter } from "../utils/workspace-utils.js";

export type TIndexOnlySidebarOptions = {
  /** Absolute path of the project root, which error messages print paths relative to. */
  rootDirPath: string;
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
  options: Pick<
    TIndexOnlySidebarOptions,
    "rootDirPath" | "sourceDocExtensions"
  >,
): boolean {
  const { sourceDocExtensions } = options;
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (indexFilePath) {
    const frontmatter = parseFrontmatter(indexFilePath, options.rootDirPath);
    return !isHiddenFromSidebar(frontmatter);
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;
    const entryPath = path.join(dirPath, entry);
    if (isDir(entryPath) && hasSidebarIndexInSubtree(entryPath, options)) {
      return true;
    }
  }
  return false;
}

function isGroupItem(item: TSidebarItem): boolean {
  return "items" in item;
}

/**
 * The index entry for `dirPath`'s sidebar index, labelled by `labelFor`, or undefined when
 * the directory has no sidebar index or it's hidden from sidebar.
 */
function buildIndexEntry(
  dirPath: string,
  options: TBuildItemsOptions,
  labelFor: (frontmatter: TSidebarSourceDocFrontmatter) => string,
): TSidebarEntry | undefined {
  const indexFilePath = findSidebarIndexFile(
    dirPath,
    options.sourceDocExtensions,
  );
  if (!indexFilePath) return undefined;

  const frontmatter = parseFrontmatter<TSidebarSourceDocFrontmatter>(
    indexFilePath,
    options.rootDirPath,
  );
  if (isHiddenFromSidebar(frontmatter)) return undefined;

  return buildSidebarEntry({
    label: labelFor(frontmatter),
    docsDirPath: options.docsDirPath,
    sourceDocFilePath: indexFilePath,
    frontmatter,
  });
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
  const { sourceDocExtensions } = options;
  const isAtGroupLevelLimit = groupLevel >= options.maxGroupLevels;
  const items: TSidebarItem[] = [];

  // The index entry of the current directory, if it has a visible sidebar index
  const indexEntry = buildIndexEntry(dirPath, options, (frontmatter) => {
    // At the limit: flattened items use the immediate parent directory name
    if (isAtGroupLevelLimit && parentDirName) return parentDirName;
    if (options.dirnameDeterminesLabels) return "Overview";
    return sidebarEntryLabel(frontmatter, "Overview");
  });
  if (indexEntry) items.push(indexEntry);

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
    if (!hasSidebarIndexInSubtree(entryPath, options)) continue;

    const subItems = buildSidebarItems(
      entryPath,
      groupLevel + 1,
      options,
      entry,
    );

    // A directory without a sidebar index promotes its child groups instead of wrapping them
    const hasSidebarIndex =
      findSidebarIndexFile(entryPath, sourceDocExtensions) !== null;
    const allGroups = subItems.length > 0 && subItems.every(isGroupItem);
    if (!hasSidebarIndex && allGroups) {
      items.push(...subItems);
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
  const items: TSidebarItem[] = [];

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === "assets") continue;

    const entryPath = path.join(dirPath, entry);
    if (!isDir(entryPath)) continue;

    const indexEntry = buildIndexEntry(entryPath, options, () =>
      pathSegmentToLabel(entry),
    );
    if (indexEntry) items.push(indexEntry);

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
    isHiddenFromSidebar(
      parseFrontmatter(rootIndexFilePath, options.rootDirPath),
    )
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
