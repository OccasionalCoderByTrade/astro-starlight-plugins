import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { slug } from "github-slugger";
import { minimatch } from "minimatch";
import {
  defaultTreeAdapter,
  parse,
  serialize,
  type DefaultTreeAdapterTypes,
} from "parse5";
import { STARLIGHT_CONTENT_CLASS } from "../utils/starlight-selectors.js";

type TElement = DefaultTreeAdapterTypes.Element;
type TParentNode = DefaultTreeAdapterTypes.ParentNode;

/** Where the site a page belongs to keeps its files. */
export type TLocalLinksSite = {
  rootDirPath: string;
  docsDirPath: string;
  publicDirPath: string;
  /** Root-absolute URL prefixes Astro and Vite generate (optimized images, bundled assets). */
  generatedPathPrefixes: string[];
};

/**
 * Page path (`guide/intro`, or `` for the home page) → the source docs Starlight serves
 * there, sorted. More than one is a page path collision.
 */
export type TSourceDocIndex = Map<string, string[]>;

export type TProcessPageOptions = {
  sourceDocFilePath: string;
  sourceDocIndex: TSourceDocIndex;
  site: TLocalLinksSite;
  validate: false | { skipPatterns: string[] };
  normalize: boolean;
  /**
   * Where a link to a file must find it: the build output dir in a build, since everything
   * served ends up there. Default: `site.publicDirPath`.
   */
  servedFilesDirPath?: string;
  /**
   * In dev, the serve integration's served-file rule, if it's installed: a link to a file
   * under the docs dir also counts when the rule accepts its docs-relative path.
   */
  servedDocsFileRule?: (docsRelativeFilePath: string) => boolean;
};

export type TBrokenLink = {
  href: string;
  reason: string;
  /** The link is a raw doc link, which the error explains once. */
  isRawDocLink?: boolean;
};

export type TPageBrokenLinks = {
  sourceDocFilePath: string;
  brokenLinks: TBrokenLink[];
};

/** What the integration resolved from its options and Astro's config. */
export type TLocalLinksSettings = Omit<
  TProcessPageOptions,
  "sourceDocFilePath" | "sourceDocIndex"
>;

/**
 * The settings the dev middleware gets, as JSON. The served-file rule can't be JSON, so it
 * comes as the id `registerServedFileRule` gave it.
 */
export type TLocalLinksDevSettings = Omit<
  TLocalLinksSettings,
  "servedDocsFileRule"
> & { servedFileRuleId?: string };

/** The name `astroServeDocsFiles` gives its integration, which this one finds it by. */
export const SERVE_DOCS_FILES_INTEGRATION_NAME = "astro-serve-docs-files";

/** The custom hook `astroServeDocsFiles` exposes its served-file rule as. */
export const SERVED_FILE_RULE_HOOK_NAME = `${SERVE_DOCS_FILES_INTEGRATION_NAME}:served-file-rule`;

type TServedFileRule = (docsRelativeFilePath: string) => boolean;

/**
 * The served-file rules `registerServedFileRule` holds, by id. It lives on `globalThis`
 * because the integration and the dev middleware each load their own copy of this module:
 * one through Node, the other through Vite's module runner, in the same process.
 */
function servedFileRules(): Map<string, TServedFileRule> {
  const registryKey = Symbol.for("astro-local-links/served-file-rules");
  const registryHolder = globalThis as { [registryKey]?: Map<string, TServedFileRule> };
  registryHolder[registryKey] ??= new Map();
  return registryHolder[registryKey];
}

/** Keeps `servedFileRule` for the dev middleware to find by the id this returns. */
export function registerServedFileRule(servedFileRule: TServedFileRule): string {
  const servedFileRuleId = randomUUID();
  servedFileRules().set(servedFileRuleId, servedFileRule);
  return servedFileRuleId;
}

/** The rule `registerServedFileRule` kept under `servedFileRuleId`. */
export function findServedFileRule(
  servedFileRuleId: string,
): TServedFileRule {
  const servedFileRule = servedFileRules().get(servedFileRuleId);
  if (!servedFileRule) {
    throw new Error(
      `[astro-local-links] the served-file rule of ${SERVE_DOCS_FILES_INTEGRATION_NAME} ` +
        `wasn't found. Does the dev middleware run in a different process from the integration?`,
    );
  }
  return servedFileRule;
}

/** The route Starlight renders every source doc through, except a custom `404.md`. */
export const STARLIGHT_DOC_ROUTE = "/[...slug]";

/** The route Starlight renders `404.md` through, so it doesn't shadow that source doc. */
const STARLIGHT_404_ROUTE = "/404";

/** The page path of a custom `404.md`, which the 404 route renders instead of the doc route. */
export const STARLIGHT_404_PAGE_PATH = "404";

/** Virtual module the dev middleware reads the integration's settings from. */
export const SETTINGS_MODULE_ID = "virtual:astro-local-links/settings";

/** The extensions Starlight's docs loader reads source docs from. */
const SOURCE_DOC_EXTENSIONS = [
  ".md",
  ".mdx",
  ".markdown",
  ".mdown",
  ".mkdn",
  ".mkd",
  ".mdwn",
];

/** The attribute that holds the link value, per link-bearing element. */
const LINK_ATTRIBUTE_BY_TAG_NAME = { a: "href", img: "src" } as const;

/** Authors put this on a raw HTML link to skip link validation for it. */
const NO_LINK_CHECK_ATTRIBUTE = "data-no-link-check";

/**
 * Resolves, validates and normalizes every local link in one page's final HTML.
 * Returns the rewritten HTML and every broken link found. Throws on a link in the content to
 * a page path collision.
 */
export function processPage(html: string, options: TProcessPageOptions) {
  const document = parse(html);
  const brokenLinks: TBrokenLink[] = [];
  let hasChanged = false;

  const tagNames = Object.keys(LINK_ATTRIBUTE_BY_TAG_NAME);
  for (const element of findElements(document, tagNames)) {
    const tagName = element.tagName as keyof typeof LINK_ATTRIBUTE_BY_TAG_NAME;
    const attribute = LINK_ATTRIBUTE_BY_TAG_NAME[tagName];
    const writtenHref = getAttribute(element, attribute);
    if (!writtenHref) continue;

    // skip markers are written by authors, so they only mean something inside the content
    const isInContent =
      closestWithClass(element, STARLIGHT_CONTENT_CLASS) !== null;
    let href = writtenHref;
    let isValidationSkipped = false;
    if (isInContent && href.startsWith("?")) {
      href = href.slice(1);
      isValidationSkipped = true;
    }
    if (isInContent && hasAttribute(element, NO_LINK_CHECK_ATTRIBUTE)) {
      removeAttribute(element, NO_LINK_CHECK_ATTRIBUTE);
      isValidationSkipped = true;
    }
    if (href !== writtenHref) setAttribute(element, attribute, href);
    hasChanged ||= href !== writtenHref || isValidationSkipped;
    if (!isLocalLink(href)) continue;
    if (
      options.site.generatedPathPrefixes.some((prefix) =>
        href.startsWith(prefix),
      )
    ) {
      continue;
    }

    const { pathPart, suffix } = splitHref(href);
    const isRelative = !pathPart.startsWith("/");
    const sitePath = isRelative
      ? toSitePath(
          resolve(dirname(options.sourceDocFilePath), pathPart),
          options.site.docsDirPath,
        )
      : posix.normalize(pathPart);
    const docLinkTarget =
      sitePath === null ? null : findDocLinkTarget(sitePath, options);
    // a collision in the content is an error whether or not link validation looks at the
    // link; outside it (the sidebar), it would error every page, not only the affected ones
    if (
      isInContent &&
      docLinkTarget &&
      docLinkTarget.sourceDocFilePaths.length > 1
    ) {
      throw createPagePathCollisionError(
        docLinkTarget.pagePath,
        docLinkTarget.sourceDocFilePaths,
      );
    }
    // what a file-form link is rewritten to, keeping the author's trailing slash or lack of one
    const pageSitePath = docLinkTarget?.isFileForm
      ? toPageSitePath(docLinkTarget.pagePath, pathPart.endsWith("/"))
      : null;

    if (options.validate && isInContent && !isValidationSkipped) {
      const fragment = suffix.includes("#")
        ? suffix.slice(suffix.indexOf("#"))
        : "";
      const isSkippedByPattern =
        sitePath !== null &&
        options.validate.skipPatterns.some(
          (pattern) =>
            minimatch(sitePath + fragment, pattern) ||
            (pageSitePath !== null &&
              minimatch(pageSitePath + fragment, pattern)),
        );
      const brokenLinkDetails = isSkippedByPattern
        ? null
        : sitePath === null
          ? { reason: "points outside the docs dir" }
          : findBrokenLinkDetails(
              sitePath,
              { pathPart, suffix },
              docLinkTarget,
              options,
            );
      if (brokenLinkDetails) {
        brokenLinks.push({ href: writtenHref, ...brokenLinkDetails });
      }
    }

    const normalizedSitePath = pageSitePath ?? (isRelative ? sitePath : null);
    if (options.normalize && normalizedSitePath !== null) {
      setAttribute(element, attribute, normalizedSitePath + suffix);
      hasChanged = true;
    }
  }

  return { html: hasChanged ? serialize(document) : html, brokenLinks };
}

// Narrow stand-ins for the DOM methods `processPage` needs, over parse5's plain-object tree.
// They take tag and class names, not selectors, so it's clear they don't match CSS.

/**
 * Every element under `root` whose tag is one of `tagNames`, in document order, like
 * `querySelectorAll`. A <template>'s contents sit in its `content`, not its `childNodes`,
 * so they're skipped, as in the DOM.
 */
function findElements(root: TParentNode, tagNames: string[]): TElement[] {
  const elements: TElement[] = [];
  for (const child of root.childNodes) {
    if (!defaultTreeAdapter.isElementNode(child)) continue;
    if (tagNames.includes(child.tagName)) elements.push(child);
    elements.push(...findElements(child, tagNames));
  }
  return elements;
}

/** The nearest element, starting at `element` itself, that has class `className`. */
function closestWithClass(
  element: TElement,
  className: string,
): TElement | null {
  let node: TParentNode | null = element;
  while (node !== null && defaultTreeAdapter.isElementNode(node)) {
    const classNames = getAttribute(node, "class")?.split(/[ \t\n\f\r]+/);
    if (classNames?.includes(className)) return node;
    node = node.parentNode;
  }
  return null;
}

/** Index of the attribute whose qualified name (`xlink:href`, not `href`) is `name`. */
function findAttributeIndex(element: TElement, name: string): number {
  return element.attrs.findIndex(
    (attribute) =>
      (attribute.prefix
        ? `${attribute.prefix}:${attribute.name}`
        : attribute.name) === name,
  );
}

function getAttribute(element: TElement, name: string): string | null {
  const attributeIndex = findAttributeIndex(element, name);
  return attributeIndex === -1 ? null : element.attrs[attributeIndex].value;
}

function hasAttribute(element: TElement, name: string): boolean {
  return findAttributeIndex(element, name) !== -1;
}

/** Replaces the value of an attribute `element` already has. */
function setAttribute(element: TElement, name: string, value: string) {
  element.attrs[findAttributeIndex(element, name)].value = value;
}

function removeAttribute(element: TElement, name: string) {
  const attributeIndex = findAttributeIndex(element, name);
  if (attributeIndex !== -1) element.attrs.splice(attributeIndex, 1);
}

/**
 * False for anything that isn't a path on this site: any URL scheme (`https:`, `mailto:`,
 * `data:`...), protocol-relative `//host`, and fragment- or query-only hrefs.
 */
function isLocalLink(href: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  if (href.startsWith("//")) return false;
  return splitHref(href).pathPart !== "";
}

/** Splits `a/b?q=1#frag` into `a/b` and `?q=1#frag`. */
function splitHref(href: string) {
  const suffixIndex = href.search(/[?#]/);
  if (suffixIndex === -1) return { pathPart: href, suffix: "" };
  return {
    pathPart: href.slice(0, suffixIndex),
    suffix: href.slice(suffixIndex),
  };
}

/** `<docs>/guide/ref/page` → `/guide/ref/page`; null if outside the docs dir. */
function toSitePath(filePath: string, docsDirPath: string): string | null {
  const docsRelativeFilePath = relative(docsDirPath, filePath);
  if (docsRelativeFilePath.startsWith("..")) return null;
  return "/" + docsRelativeFilePath.split(sep).join("/");
}

/** A local link's target among the source docs, from `findDocLinkTarget`. */
type TDocLinkTarget = {
  pagePath: string;
  sourceDocFilePaths: string[];
  /** The link names a source doc's file, not its page, and the two differ. */
  isFileForm: boolean;
};

/**
 * The source docs a link at `sitePath` points to, if it is exactly their page-form link
 * (`/reference/list-syntax-copy`) or exactly one's file-form link
 * (`/reference/List%20Syntax%20cOp%26%26Y`). A link that only matches once slugified is
 * neither, since the host serves only the exact page path.
 */
function findDocLinkTarget(
  sitePath: string,
  { site, sourceDocIndex }: TProcessPageOptions,
): TDocLinkTarget | null {
  const docsRelativeLinkPath = toDocsRelativePagePath(sitePath);
  if (docsRelativeLinkPath === null) return null;
  const pagePath = toPagePath(docsRelativeLinkPath.split("/"));
  const sourceDocFilePaths = sourceDocIndex.get(pagePath);
  if (!sourceDocFilePaths) return null;
  if (docsRelativeLinkPath === pagePath) {
    return { pagePath, sourceDocFilePaths, isFileForm: false };
  }

  const isFileForm = sourceDocFilePaths.some((sourceDocFilePath) => {
    const extensionlessFilePath = removeExtension(
      relative(site.docsDirPath, sourceDocFilePath).split(sep).join("/"),
    );
    if (docsRelativeLinkPath === extensionlessFilePath) return true;
    // an index doc's file-form link can also name its folder
    const isIndexDoc = slug(posix.basename(extensionlessFilePath)) === "index";
    const docsRelativeDirPath = posix.dirname(extensionlessFilePath);
    return (
      isIndexDoc &&
      docsRelativeLinkPath ===
        (docsRelativeDirPath === "." ? "" : docsRelativeDirPath)
    );
  });
  return isFileForm ? { pagePath, sourceDocFilePaths, isFileForm } : null;
}

/** `café-notes`, with a trailing slash → `/caf%C3%A9-notes/`; `` → `/`. */
function toPageSitePath(pagePath: string, hasTrailingSlash: boolean): string {
  if (pagePath === "") return "/";
  return encodeURI(`/${pagePath}${hasTrailingSlash ? "/" : ""}`);
}

/**
 * Why nothing on the site is served at `sitePath`, or null if something is. `writtenHref`
 * is the link's href as written, split by `splitHref`.
 */
function findBrokenLinkDetails(
  sitePath: string,
  writtenHref: ReturnType<typeof splitHref>,
  docLinkTarget: TDocLinkTarget | null,
  options: TProcessPageOptions,
): Omit<TBrokenLink, "href"> | null {
  const { site, normalize } = options;
  const docsRelativeLinkPath = toDocsRelativePagePath(sitePath);
  if (docsRelativeLinkPath === null)
    return { reason: `malformed URL encoding in ${sitePath}` };
  const servedFilePath = join(
    options.servedFilesDirPath ?? site.publicDirPath,
    docsRelativeLinkPath,
  );
  if (isFile(servedFilePath)) return null;
  if (
    options.servedDocsFileRule &&
    isFile(join(site.docsDirPath, docsRelativeLinkPath)) &&
    options.servedDocsFileRule(docsRelativeLinkPath)
  ) {
    return null;
  }

  const rawDocLinkPagePath = findRawDocLinkPagePath(
    docsRelativeLinkPath,
    options,
  );
  if (rawDocLinkPagePath !== null) {
    // the extensionless link is a file-form link, broken without link normalization unless
    // the file path is also the page path
    const isExtensionlessLinkBroken =
      !normalize &&
      removeExtension(docsRelativeLinkPath) !== rawDocLinkPagePath;
    const pageHref = isExtensionlessLinkBroken
      ? toPageSitePath(rawDocLinkPagePath, false)
      : removeExtension(writtenHref.pathPart);
    return {
      reason:
        `raw doc link, but /${docsRelativeLinkPath} isn't served. ` +
        `To link to the page, use ${pageHref}${writtenHref.suffix}.`,
      isRawDocLink: true,
    };
  }
  if (docLinkTarget === null) {
    return { reason: `no source doc or public file at ${sitePath}` };
  }
  if (docLinkTarget.isFileForm && !normalize) {
    const pageSitePath = toPageSitePath(docLinkTarget.pagePath, true);
    return {
      reason:
        `links to a source doc by its file path, but its page is served at ` +
        `${pageSitePath}. Link to ${pageSitePath}, or turn on link normalization.`,
    };
  }
  return null;
}

/**
 * The page path of the source doc a raw doc link names: `guide/List Syntax.md` →
 * `guide/list-syntax`. Null if the link doesn't name a source doc's file, extension
 * included.
 */
function findRawDocLinkPagePath(
  docsRelativeLinkPath: string,
  { site, sourceDocIndex }: TProcessPageOptions,
): string | null {
  // the extension match is case-sensitive, like the loader's glob
  if (!SOURCE_DOC_EXTENSIONS.includes(extname(docsRelativeLinkPath))) {
    return null;
  }
  const pagePath = toPagePath(removeExtension(docsRelativeLinkPath).split("/"));
  const sourceDocFilePath = join(site.docsDirPath, docsRelativeLinkPath);
  return sourceDocIndex.get(pagePath)?.includes(sourceDocFilePath)
    ? pagePath
    : null;
}

/**
 * Every source doc under `docsDirPath`, by the page path Astro gives it by default: each
 * path segment slugified, extension dropped, with a trailing `index` dropped. Like
 * Starlight's docs loader, it skips `_`-prefixed files and dotfiles.
 */
export function buildSourceDocIndex(docsDirPath: string): TSourceDocIndex {
  const sourceDocIndex: TSourceDocIndex = new Map();
  for (const sourceDocFilePath of collectSourceDocFilePaths(docsDirPath)) {
    const pagePath = toSourceDocPagePath(
      relative(docsDirPath, sourceDocFilePath),
    );
    const sourceDocFilePaths = sourceDocIndex.get(pagePath) ?? [];
    sourceDocFilePaths.push(sourceDocFilePath);
    sourceDocIndex.set(pagePath, sourceDocFilePaths);
  }
  for (const sourceDocFilePaths of sourceDocIndex.values()) {
    sourceDocFilePaths.sort();
  }
  return sourceDocIndex;
}

/**
 * One error message listing every page path more than one source doc shares, with their
 * files, or null if there are none.
 */
export function formatPagePathCollisionsError(
  sourceDocIndex: TSourceDocIndex,
): string | null {
  const collisions = [...sourceDocIndex]
    .filter(([, sourceDocFilePaths]) => sourceDocFilePaths.length > 1)
    .sort(([firstPagePath], [secondPagePath]) =>
      firstPagePath.localeCompare(secondPagePath),
    );
  if (collisions.length === 0) return null;
  return (
    `[astro-local-links] ${collisions.length} page path collision` +
    `${collisions.length === 1 ? "" : "s"}:\n` +
    collisions
      .map(([pagePath, sourceDocFilePaths]) =>
        formatPagePathCollision(pagePath, sourceDocFilePaths),
      )
      .join("\n")
  );
}

/** The error for one page path several source docs share. */
function createPagePathCollisionError(
  pagePath: string,
  sourceDocFilePaths: string[],
): Error {
  return new Error(
    `[astro-local-links] Page path collision: ` +
      formatPagePathCollision(pagePath, sourceDocFilePaths),
  );
}

/** Names a page path several source docs share, and each of them. */
function formatPagePathCollision(
  pagePath: string,
  sourceDocFilePaths: string[],
): string {
  return (
    `${sourceDocFilePaths.length} source docs share the page path ` +
    `${toPageSitePath(pagePath, true)}. Rename all but one of them:\n` +
    sourceDocFilePaths.map((filePath) => `    - ${filePath}`).join("\n")
  );
}

function collectSourceDocFilePaths(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath).flatMap((entryName) => {
    if (entryName.startsWith(".")) return [];
    const entryFileOrDirPath = join(dirPath, entryName);
    // statSync follows symlinks, as Starlight's docs loader does; a broken one is skipped
    const entryStats = statSync(entryFileOrDirPath, { throwIfNoEntry: false });
    if (!entryStats) return [];
    if (entryStats.isDirectory()) {
      return collectSourceDocFilePaths(entryFileOrDirPath);
    }
    // the extension match is case-sensitive, like the loader's glob
    const isSourceDoc =
      entryStats.isFile() &&
      !entryName.startsWith("_") &&
      SOURCE_DOC_EXTENSIONS.includes(extname(entryName));
    return isSourceDoc ? [entryFileOrDirPath] : [];
  });
}

/**
 * `My Guide/List Syntax.md` → `my-guide/list-syntax`, `reference/Index.md` → `reference`.
 * Unlike Astro's ID, the home page's `index.md` → ``, to match the decoded pathname `/`.
 */
function toSourceDocPagePath(docsRelativeFilePath: string): string {
  return toPagePath(removeExtension(docsRelativeFilePath).split(sep));
}

/** `["My Guide", "List Syntax"]` → `my-guide/list-syntax`, `["guide", "Index"]` → `guide`. */
function toPagePath(segments: string[]): string {
  return segments
    .map((segment) => slug(segment))
    .join("/")
    .replace(/(^|\/)index$/, "");
}

/** `guide/v1.2-notes.md` → `guide/v1.2-notes`. */
function removeExtension(filePath: string): string {
  return filePath.slice(0, filePath.length - extname(filePath).length);
}

/** `/guide/my%20notes/` → `guide/my notes`; null if the URL encoding is malformed. */
function toDocsRelativePagePath(sitePath: string): string | null {
  try {
    return decodeURIComponent(sitePath).replace(/^\/+|\/+$/g, "");
  } catch {
    return null;
  }
}

function isFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}

/**
 * The source doc a page at URL `pathname` was rendered from. Throws when there is none, or
 * when its page path is a collision.
 */
export function resolveSourceDoc(
  pathname: string,
  sourceDocIndex: TSourceDocIndex,
): string {
  const pagePath = toDocsRelativePagePath(pathname) ?? pathname;
  const sourceDocFilePaths = sourceDocIndex.get(pagePath) ?? [];
  if (sourceDocFilePaths.length === 1) return sourceDocFilePaths[0];

  if (sourceDocFilePaths.length === 0) {
    throw new Error(
      `[astro-local-links] No source doc for ${pathname}. Source docs are served at ` +
        `their path with each segment slugified, and none is served at /${pagePath}.`,
    );
  }
  throw createPagePathCollisionError(pagePath, sourceDocFilePaths);
}

/**
 * The error for a page at URL `pathname` that `routePattern` served, when that's a source
 * doc's page path, so the doc route didn't serve it. Null when no source doc has it.
 */
export function formatShadowedDocError(
  pathname: string,
  routePattern: string,
  sourceDocIndex: TSourceDocIndex,
): string | null {
  const shadowedDoc = formatShadowedDoc(pathname, routePattern, sourceDocIndex);
  if (!shadowedDoc) return null;
  return (
    `[astro-local-links] ${shadowedDoc}, not Starlight's doc route (${STARLIGHT_DOC_ROUTE}). ` +
    SHADOWED_DOC_CAUSES
  );
}

/** A page at URL `pathname` and the route pattern that served it. */
export type TServedPage = { pathname: string; routePattern: string };

/**
 * One error message listing each source doc whose page path a route other than the doc
 * route served, or null if there are none.
 */
export function formatShadowedDocsError(
  servedPages: TServedPage[],
  sourceDocIndex: TSourceDocIndex,
): string | null {
  const shadowedDocs = servedPages
    .filter(({ routePattern }) => routePattern !== STARLIGHT_DOC_ROUTE)
    .sort((firstServedPage, secondServedPage) =>
      firstServedPage.pathname.localeCompare(secondServedPage.pathname),
    )
    .map(({ pathname, routePattern }) =>
      formatShadowedDoc(pathname, routePattern, sourceDocIndex),
    )
    .filter((shadowedDoc) => shadowedDoc !== null);
  if (shadowedDocs.length === 0) return null;
  return (
    `[astro-local-links] ${shadowedDocs.length} shadowed doc` +
    `${shadowedDocs.length === 1 ? "" : "s"}, served by a route other than Starlight's ` +
    `doc route (${STARLIGHT_DOC_ROUTE}):\n` +
    shadowedDocs.map((shadowedDoc) => `  - ${shadowedDoc}`).join("\n") +
    `\n${SHADOWED_DOC_CAUSES}`
  );
}

const SHADOWED_DOC_CAUSES =
  `Either another page or route (such as one in src/pages) shadows the source doc, ` +
  `or Starlight's doc route changed.`;

/** Names the source doc whose page path `routePattern` served, or null when there is none. */
function formatShadowedDoc(
  pathname: string,
  routePattern: string,
  sourceDocIndex: TSourceDocIndex,
): string | null {
  if (routePattern === STARLIGHT_404_ROUTE) return null;
  const pagePath = toDocsRelativePagePath(pathname) ?? pathname;
  const sourceDocFilePaths = sourceDocIndex.get(pagePath);
  if (!sourceDocFilePaths) return null;
  return (
    `${pathname} is the page path of ${sourceDocFilePaths.join(", ")}, ` +
    `but ${routePattern} served it`
  );
}

/** One error message listing every broken local link, grouped by source doc. */
export function formatBrokenLinksError(
  pagesBrokenLinks: TPageBrokenLinks[],
): string {
  const brokenLinkCount = pagesBrokenLinks.reduce(
    (count, page) => count + page.brokenLinks.length,
    0,
  );
  const sortedPages = [...pagesBrokenLinks].sort((a, b) =>
    a.sourceDocFilePath.localeCompare(b.sourceDocFilePath),
  );
  const pageSections = sortedPages.map(
    (page) =>
      `${page.sourceDocFilePath}\n` +
      page.brokenLinks
        .map((brokenLink) => `  - ${brokenLink.href}: ${brokenLink.reason}`)
        .join("\n"),
  );
  const hasRawDocLink = pagesBrokenLinks.some((page) =>
    page.brokenLinks.some((brokenLink) => brokenLink.isRawDocLink),
  );
  return (
    `[astro-local-links] ${brokenLinkCount} broken local link` +
    `${brokenLinkCount === 1 ? "" : "s"}:\n${pageSections.join("\n")}` +
    (hasRawDocLink ? `\n\n${RAW_DOC_LINK_EXPLANATION}` : "")
  );
}

const RAW_DOC_LINK_EXPLANATION =
  `A link to a source doc with its extension (like ./auto-list-syntax.md) is a raw doc link: ` +
  `it sends readers to the raw Markdown source, not to the page built from it. If that's ` +
  `what you want, the raw doc must be served: let astroServeDocsFiles serve it (it skips ` +
  `drafts and ignored or _-prefixed files), or put a copy in public/. To link to the page ` +
  `instead, drop the extension or use the page path.`;

/**
 * Runs `processPage` on the HTML of the Starlight doc page at URL `pathname`, after finding
 * its source doc. `pageBrokenLinks` is null when the page has none.
 */
export function processDocPage(
  pathname: string,
  html: string,
  settings: TLocalLinksSettings,
  sourceDocIndex: TSourceDocIndex,
) {
  const sourceDocFilePath = resolveSourceDoc(pathname, sourceDocIndex);
  const processedPage = processPage(html, {
    sourceDocFilePath,
    sourceDocIndex,
    ...settings,
  });
  const pageBrokenLinks: TPageBrokenLinks | null =
    processedPage.brokenLinks.length > 0
      ? { sourceDocFilePath, brokenLinks: processedPage.brokenLinks }
      : null;
  return { html: processedPage.html, pageBrokenLinks };
}
