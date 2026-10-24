import { parseFrontmatter as astroParseFrontmatter } from "@astrojs/markdown-remark";
import type { AstroIntegrationLogger } from "astro";
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
import {
  hasUnderscoreFileName,
  isHiddenFromSidebar,
} from "../utils/sidebar-visibility.js";
import { isFile } from "../utils/workspace-utils.js";

type TFrontmatter = TSidebarEntryFrontmatter & {
  slug?: string;
  draft?: boolean;
  sidebar?: { hidden?: boolean };
  /** The plugin's own key. `leaf: true` makes a sub-index link to this doc a single entry. */
  indexSourcedSidebar?: { leaf?: boolean };
};

/** A source doc's frontmatter and body, from one read. */
type TSourceDoc = {
  frontmatter: TFrontmatter;
  body: string;
};

/** A sidebar index file and its contents. */
type TSidebarIndex = {
  dirPath: string;
  indexFilePath: string;
  indexDoc: TSourceDoc;
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
  currentDepth: number;
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
 * resolves against the docs root, a relative one against the sidebar index's directory.
 */
function resolveLinkPath(
  linkPath: string,
  options: TBuildItemsOptions,
): string {
  if (linkPath.startsWith("/")) {
    return path.join(
      options.docsDirPath,
      stripBase(linkPath, options.base),
    );
  }
  return path.resolve(options.sidebarIndex.dirPath, linkPath);
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

/**
 * Whether `linkPath` is a sub-index link: it names a folder (`./sub/`, `.`, `..`) or a
 * directory's `index`, with or without a source doc extension.
 */
function isSubIndexLinkPath(
  linkPath: string,
  sourceDocExtensions: string[],
): boolean {
  const lastSegment = linkPath.split("/").pop() ?? "";
  return (
    linkPath.endsWith("/") ||
    lastSegment === "." ||
    lastSegment === ".." ||
    lastSegment === "index" ||
    sourceDocExtensions.some((extension) => lastSegment === `index${extension}`)
  );
}

/** Step 5 of resolving a link: the sidebar index a sub-index link points at. */
function resolveSubIndexLink(
  linkPath: string,
  resolvedPath: string,
  options: TBuildItemsOptions,
): TLinkTarget {
  const namesFolder = !/(^|\/)index(\.[^/]*)?$/.test(linkPath);
  const dirPath = namesFolder ? resolvedPath : path.dirname(resolvedPath);

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
  linkPath: string,
  resolvedPath: string,
  options: TBuildItemsOptions,
): TLinkTarget {
  const { sourceDocExtensions } = options;

  let filePath: string | null;
  if (hasSourceDocExtension(linkPath, sourceDocExtensions)) {
    // A link that already carries a source doc extension names that exact file
    filePath = isFile(resolvedPath) ? resolvedPath : null;
  } else {
    filePath = findSourceDoc(resolvedPath, sourceDocExtensions);
    // Some other extension (`./manual.pdf`) and no `manual.pdf.md`: a docs asset
    if (!filePath && path.extname(linkPath)) return { kind: "skipped" };
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

  const resolvedPath = resolveLinkPath(linkPath, options);
  if (isSubIndexLinkPath(linkPath, options.sourceDocExtensions)) {
    return resolveSubIndexLink(linkPath, resolvedPath, options);
  }
  return resolvePageLink(linkPath, resolvedPath, options);
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
    `[starlight-index-sourced-sidebar] Skipped link "${href}" in ${docsRelativeIndexFilePath}: ${reason}`,
  );
}

/** `{ badge }` to spread into an entry, or nothing when there's no badge. */
function badgeProperty(badge: TSidebarBadge | undefined) {
  return badge ? { badge } : {};
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
  return {
    label: sidebarEntryLabel(
      indexDoc.frontmatter,
      pathSegmentToLabel(path.basename(dirPath)),
    ),
    slug: toSidebarSlug({
      docsDirPath: options.docsDirPath,
      sourceDocFilePath: indexFilePath,
      frontmatterSlug: indexDoc.frontmatter.slug,
    }),
    ...badgeProperty(
      options.indexMarker ?? sidebarEntryBadge(indexDoc.frontmatter),
    ),
  };
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

  const subItems = buildItems({
    ...options,
    sidebarIndex: subIndex,
    currentDepth: options.currentDepth + 1,
    ancestorDirPaths: new Set([...options.ancestorDirPaths, subIndex.dirPath]),
  });

  // The root group is level 1, so the sub-index group would be level currentDepth + 2
  if (options.currentDepth + 2 > options.maxGroupLevels) return subItems;
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
    {
      label: sidebarEntryLabel(
        linkedDoc.frontmatter,
        pathSegmentToLabel(path.basename(filePath, path.extname(filePath))),
      ),
      slug: toSidebarSlug({
        docsDirPath: options.docsDirPath,
        sourceDocFilePath: filePath,
        frontmatterSlug: linkedDoc.frontmatter.slug,
      }),
      ...badgeProperty(sidebarEntryBadge(linkedDoc.frontmatter)),
    },
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
 * expands, whatever its leaf key says.
 */
export function getIndexSourcedSidebarGroup(
  options: TIndexSourcedSidebarOptions,
): TSidebarGroup | undefined {
  const { dirPath, sourceDocExtensions } = options;
  const indexFilePath = findSidebarIndexFile(dirPath, sourceDocExtensions);
  if (!indexFilePath) {
    throw new Error(
      `[starlight-index-sourced-sidebar] No sidebar index (index${sourceDocExtensions.join(", index")}) found in "${dirPath}"`,
    );
  }

  const indexDoc = readSourceDoc(indexFilePath);
  if (isHiddenFromSidebar(indexDoc.frontmatter)) return undefined;

  const items = buildItems({
    ...options,
    sidebarIndex: { dirPath, indexFilePath, indexDoc },
    currentDepth: 0,
    ancestorDirPaths: new Set([dirPath]),
  });

  return {
    label: pathSegmentToLabel(path.basename(dirPath)),
    items,
    collapsed: options.collapsed,
  };
}
