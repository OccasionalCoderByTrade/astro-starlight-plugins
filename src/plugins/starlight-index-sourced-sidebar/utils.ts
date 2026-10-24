import type { AstroIntegrationLogger } from "astro";
import * as path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { buildSidebarEntry } from "../utils/sidebar-entries.js";
import { findSidebarIndexFile } from "../utils/sidebar-index.js";
import {
  pathSegmentToLabel,
  sidebarEntryLabel,
  type TSidebarEntryFrontmatter,
} from "../utils/sidebar-labels.js";
import type {
  TSidebarBadge,
  TSidebarGroup,
  TSidebarItem,
} from "../utils/sidebar-types.js";
import { isHiddenFromSidebar } from "../utils/sidebar-visibility.js";
import {
  isFile,
  isOutsideDir,
  parseSourceDoc,
  type TSourceDoc,
  type TSourceDocFrontmatter,
} from "../utils/workspace-utils.js";

export const PLUGIN_NAME = "starlight-index-sourced-sidebar";
const LOG_PREFIX = `[${PLUGIN_NAME}]`;

type TFrontmatter = TSourceDocFrontmatter &
  TSidebarEntryFrontmatter & {
    /** The plugin's own key. `leaf: true` makes a sub-index link to this doc a single entry. */
    indexSourcedSidebar?: { leaf?: boolean };
  };

/** A sidebar index file and its contents. */
type TSidebarIndex = {
  dirPath: string;
  indexFilePath: string;
  indexDoc: TSourceDoc<TFrontmatter>;
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
  /** Astro's `base`, stripped from root-absolute links that start with it. */
  base: string;
  /** Where skipped-link warnings go: the logger Starlight passes to `config:setup`. */
  logger: AstroIntegrationLogger;
};

/** Internal: what each level of the recursion needs on top of the public options. */
type TBuildItemsOptions = Omit<TIndexSourcedSidebarOptions, "dirPath"> & {
  sidebarIndex: TSidebarIndex;
  /** The group level of the current sidebar index's group; the root group is level 1. */
  groupLevel: number;
  /** Dirs of the sidebar indexes from the root down to this one, this one included. */
  ancestorDirPaths: Set<string>;
};

/**
 * What a link in a sidebar index resolves to: another directory's sidebar index, a page, or
 * nothing. A skipped link carries a warning when the author should hear about it.
 */
type TLinkTarget =
  | { kind: "sub-index"; dirPath: string; indexFilePath: string }
  | { kind: "page"; filePath: string }
  | { kind: "skipped"; warning?: string };

/** A link path after step 4 of resolving it. */
type TResolvedLinkPath = {
  /** The link path, with `base` stripped when it's root-absolute and starts with it. */
  baselessLinkPath: string;
  /**
   * The absolute filesystem path the link points at (a file or a folder), with no trailing
   * separator, so it compares equal to directory paths.
   */
  absoluteLinkPath: string;
};

/** Throws when the file can't be read or its YAML is malformed. */
function readSourceDoc(filePath: string): TSourceDoc<TFrontmatter> {
  return parseSourceDoc<TFrontmatter>(filePath);
}

/**
 * Whether the file at `filePath` has a `_`-prefixed name, which Astro never turns into a
 * page. Only the filename counts: `_partials/page.md` is still a page.
 */
function hasUnderscoreFileName(filePath: string): boolean {
  return path.basename(filePath).startsWith("_");
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

/**
 * The hrefs of the inline and reference-style links in `body`, in the order written. A
 * reference-style link takes its href from its definition.
 */
function extractMarkdownLinks(body: string): string[] {
  const tree = unified().use(remarkParse).parse(body);

  // The first definition of an identifier wins, as in CommonMark
  const definitionUrls = new Map<string, string>();
  visit(tree, "definition", (node) => {
    if (!definitionUrls.has(node.identifier)) {
      definitionUrls.set(node.identifier, node.url);
    }
  });

  const hrefs: string[] = [];
  visit(tree, (node) => {
    if (node.type === "link") {
      hrefs.push(node.url);
    } else if (node.type === "linkReference") {
      const definitionUrl = definitionUrls.get(node.identifier);
      if (definitionUrl !== undefined) hrefs.push(definitionUrl);
    }
  });

  return hrefs;
}

/** Whether `href` has a URL scheme (`https:`, `tel:`, ...) or is protocol-relative (`//`). */
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/**
 * Steps 1-3 of resolving a link: the path part of `href`, or null when the link is skipped
 * silently (external links and same-page anchors).
 */
function toLinkPath(href: string): string | null {
  if (isExternal(href)) return null;

  const encodedLinkPath = href.split("?")[0].split("#")[0].trim();
  if (!encodedLinkPath) return null;
  return percentDecode(encodedLinkPath);
}

/** `encodedLinkPath` percent-decoded, or as written when its `%` escapes are malformed. */
function percentDecode(encodedLinkPath: string): string {
  try {
    return decodeURIComponent(encodedLinkPath);
  } catch {
    return encodedLinkPath;
  }
}

/**
 * Step 4 of resolving a link: the absolute path `linkPath` points at. A root-absolute link
 * has `base` stripped and resolves against the docs root, a relative one against the
 * sidebar index's directory.
 */
function resolveLinkPath(
  linkPath: string,
  options: TBuildItemsOptions,
): TResolvedLinkPath {
  if (linkPath.startsWith("/")) {
    const baselessLinkPath = stripBase(linkPath, options.base);
    return {
      baselessLinkPath,
      // `path.join` keeps a trailing separator (`/guides/`), which `path.resolve` drops
      absoluteLinkPath: path.resolve(
        path.join(options.docsDirPath, baselessLinkPath),
      ),
    };
  }
  return {
    baselessLinkPath: linkPath,
    absoluteLinkPath: path.resolve(options.sidebarIndex.dirPath, linkPath),
  };
}

/** `rootAbsoluteLinkPath` without a leading `base`, when it starts with that whole segment. */
function stripBase(rootAbsoluteLinkPath: string, base: string): string {
  const basePrefix = base.replace(/\/+$/, "");
  if (!basePrefix) return rootAbsoluteLinkPath;
  if (rootAbsoluteLinkPath === basePrefix) return "/";
  if (rootAbsoluteLinkPath.startsWith(`${basePrefix}/`)) {
    return rootAbsoluteLinkPath.slice(basePrefix.length);
  }
  return rootAbsoluteLinkPath;
}

/** Whether the last segment of `linkPath` is `index`, bare or with a source doc extension. */
function namesIndexFile(
  linkPath: string,
  sourceDocExtensions: string[],
): boolean {
  const lastSegment = linkPath.split("/").pop() ?? "";
  return (
    lastSegment === "index" ||
    sourceDocExtensions.some((extension) => lastSegment === `index${extension}`)
  );
}

/**
 * Whether `linkPath` is a sub-index link: it names a folder (`./sub/`) or a directory's
 * `index`, with or without a source doc extension.
 */
function isSubIndexLinkPath(
  linkPath: string,
  sourceDocExtensions: string[],
): boolean {
  return (
    linkPath.endsWith("/") || namesIndexFile(linkPath, sourceDocExtensions)
  );
}

/**
 * The directory a link names: the folder itself, or the folder of the `index` it names.
 * For any other link, the path it points at.
 */
function toLinkedDirPath(
  { baselessLinkPath, absoluteLinkPath }: TResolvedLinkPath,
  sourceDocExtensions: string[],
): string {
  return namesIndexFile(baselessLinkPath, sourceDocExtensions)
    ? path.dirname(absoluteLinkPath)
    : absoluteLinkPath;
}

/**
 * Whether a link points at the directory, or the sidebar index, of the current sidebar
 * index or of any directory above it up to the docs root (`.`, `..`, `../index.md`, `/`),
 * whether or not that directory is in the current chain of sidebar indexes. A link that
 * goes up and then sideways (`../setup.md`) isn't an ancestor link.
 */
function isAncestorLink(
  resolvedLinkPath: TResolvedLinkPath,
  options: TBuildItemsOptions,
): boolean {
  const linkedDirPath = toLinkedDirPath(
    resolvedLinkPath,
    options.sourceDocExtensions,
  );
  return !isOutsideDir(linkedDirPath, options.sidebarIndex.dirPath);
}

/** Step 5 of resolving a link: the sidebar index a sub-index link points at. */
function resolveSubIndexLink(
  resolvedLinkPath: TResolvedLinkPath,
  options: TBuildItemsOptions,
): TLinkTarget {
  const dirPath = toLinkedDirPath(
    resolvedLinkPath,
    options.sourceDocExtensions,
  );

  const indexFilePath = findSidebarIndexFile(
    dirPath,
    options.sourceDocExtensions,
  );
  if (!indexFilePath) {
    return { kind: "skipped", warning: "the directory has no sidebar index" };
  }
  if (options.ancestorDirPaths.has(dirPath)) {
    return {
      kind: "skipped",
      warning: "it links back to an ancestor sidebar index",
    };
  }
  return { kind: "sub-index", dirPath, indexFilePath };
}

/** Steps 6-7 of resolving a link: the page a link that isn't a sub-index link points at. */
function resolvePageLink(
  { baselessLinkPath, absoluteLinkPath }: TResolvedLinkPath,
  options: TBuildItemsOptions,
): TLinkTarget {
  const { sourceDocExtensions } = options;

  let filePath: string | null;
  if (hasSourceDocExtension(baselessLinkPath, sourceDocExtensions)) {
    // A link that already carries a source doc extension names that exact file
    filePath = isFile(absoluteLinkPath) ? absoluteLinkPath : null;
  } else if (path.extname(baselessLinkPath) && isFile(absoluteLinkPath)) {
    // Some other extension, and that exact file exists (`./manual.pdf`): a docs asset
    return { kind: "skipped" };
  } else {
    // No extension, or a dotted name with no such file (`./v1.2` reaches `v1.2.md`)
    filePath = findSourceDoc(absoluteLinkPath, sourceDocExtensions);
  }
  if (!filePath) {
    return { kind: "skipped", warning: "no source doc exists there" };
  }

  if (hasUnderscoreFileName(filePath)) {
    return {
      kind: "skipped",
      warning: "files whose names start with `_` aren't pages",
    };
  }
  return { kind: "page", filePath };
}

/** What `href`, written in the current sidebar index, points at. */
function resolveLink(href: string, options: TBuildItemsOptions): TLinkTarget {
  const linkPath = toLinkPath(href);
  if (!linkPath) return { kind: "skipped" };

  const resolvedLinkPath = resolveLinkPath(linkPath, options);
  if (isOutsideDir(options.docsDirPath, resolvedLinkPath.absoluteLinkPath)) {
    return { kind: "skipped", warning: "it resolves outside the docs root" };
  }
  if (isAncestorLink(resolvedLinkPath, options)) {
    return {
      kind: "skipped",
      warning:
        "it links to the sidebar index's own directory or an ancestor directory",
    };
  }
  if (
    isSubIndexLinkPath(
      resolvedLinkPath.baselessLinkPath,
      options.sourceDocExtensions,
    )
  ) {
    return resolveSubIndexLink(resolvedLinkPath, options);
  }
  return resolvePageLink(resolvedLinkPath, options);
}

/** Warns that `href`, as written in the current sidebar index, gives no entry. */
function warnSkippedLink(
  options: TBuildItemsOptions,
  href: string,
  reason: string,
): void {
  const docsRelativeIndexFilePath = path
    .relative(options.docsDirPath, options.sidebarIndex.indexFilePath)
    .replace(/\\/g, "/");
  options.logger.warn(
    `${LOG_PREFIX} Skipped link "${href}" in ${docsRelativeIndexFilePath}: ${reason}`,
  );
}

/**
 * The entry for a sidebar index's own page. It shows the index marker when one is set, and
 * otherwise its `sidebar.badge`.
 */
function toIndexEntry(
  sidebarIndex: TSidebarIndex,
  options: Pick<TIndexSourcedSidebarOptions, "docsDirPath" | "indexMarker">,
): TSidebarItem {
  const { dirPath, indexFilePath, indexDoc } = sidebarIndex;
  return buildSidebarEntry({
    label: sidebarEntryLabel(
      indexDoc.frontmatter,
      pathSegmentToLabel(path.basename(dirPath)),
    ),
    docsDirPath: options.docsDirPath,
    sourceDocFilePath: indexFilePath,
    frontmatter: indexDoc.frontmatter,
    badgeOverride: options.indexMarker,
  });
}

/** The entries a sub-index link adds: a nested group, its flattened items, or a leaf entry. */
function buildSubIndexItems(
  target: Extract<TLinkTarget, { kind: "sub-index" }>,
  options: TBuildItemsOptions,
): TSidebarItem[] {
  const subIndex: TSidebarIndex = {
    dirPath: target.dirPath,
    indexFilePath: target.indexFilePath,
    indexDoc: readSourceDoc(target.indexFilePath),
  };
  if (isHiddenFromSidebar(subIndex.indexDoc.frontmatter)) return [];

  if (subIndex.indexDoc.frontmatter.indexSourcedSidebar?.leaf === true) {
    return [toIndexEntry(subIndex, options)];
  }

  // Past the limit, the sub-index's entries are flattened into the current group
  const subGroupLevel = options.groupLevel + 1;
  const isFlattened = subGroupLevel > options.maxGroupLevels;
  const subItems = buildItems({
    ...options,
    sidebarIndex: subIndex,
    groupLevel: isFlattened ? options.groupLevel : subGroupLevel,
    ancestorDirPaths: new Set([...options.ancestorDirPaths, subIndex.dirPath]),
  });

  if (isFlattened) return subItems;
  return [
    {
      label: pathSegmentToLabel(path.basename(subIndex.dirPath)),
      items: subItems,
      collapsed: options.collapsed,
    },
  ];
}

/** The entry a page link adds, or none when the page is hidden from sidebar. */
function buildPageItems(
  target: Extract<TLinkTarget, { kind: "page" }>,
  options: TBuildItemsOptions,
): TSidebarItem[] {
  const { filePath } = target;
  const linkedDoc = readSourceDoc(filePath);
  if (isHiddenFromSidebar(linkedDoc.frontmatter)) return [];

  return [
    buildSidebarEntry({
      label: sidebarEntryLabel(
        linkedDoc.frontmatter,
        pathSegmentToLabel(path.basename(filePath, path.extname(filePath))),
      ),
      docsDirPath: options.docsDirPath,
      sourceDocFilePath: filePath,
      frontmatter: linkedDoc.frontmatter,
    }),
  ];
}

/** A visible sidebar index's entries: its index entry, then one per link, in order. */
function buildItems(options: TBuildItemsOptions): TSidebarItem[] {
  const items: TSidebarItem[] = [toIndexEntry(options.sidebarIndex, options)];

  for (const href of extractMarkdownLinks(options.sidebarIndex.indexDoc.body)) {
    const target = resolveLink(href, options);
    if (target.kind === "skipped") {
      if (target.warning) warnSkippedLink(options, href, target.warning);
    } else if (target.kind === "sub-index") {
      items.push(...buildSubIndexItems(target, options));
    } else {
      items.push(...buildPageItems(target, options));
    }
  }

  return items;
}

/**
 * The root group for `options.dirPath`, built from the links in its sidebar index, or
 * undefined when its sidebar index is hidden from sidebar. A root sidebar index always
 * expands, whatever its leaf key says. Expects options already checked by
 * `validateSidebarOptions`.
 */
export function getIndexSourcedSidebarGroup(
  options: TIndexSourcedSidebarOptions,
): TSidebarGroup | undefined {
  const { dirPath, sourceDocExtensions } = options;
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  // Unreachable after validateSidebarOptions, which fails startup on a missing sidebar index
  if (!indexFilePath) {
    const indexFileNames = sourceDocExtensions
      .map((extension) => `index${extension}`)
      .join(" or ");
    throw new Error(
      `${LOG_PREFIX} No sidebar index (${indexFileNames}) for directory: ${dirPath}`,
    );
  }

  const indexDoc = readSourceDoc(indexFilePath);
  if (isHiddenFromSidebar(indexDoc.frontmatter)) return undefined;

  const items = buildItems({
    ...options,
    sidebarIndex: { dirPath, indexFilePath, indexDoc },
    groupLevel: 1,
    ancestorDirPaths: new Set([dirPath]),
  });

  return {
    label: pathSegmentToLabel(path.basename(dirPath)),
    items,
    collapsed: options.collapsed,
  };
}
