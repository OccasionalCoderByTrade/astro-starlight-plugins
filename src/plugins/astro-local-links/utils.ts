import { existsSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
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
  docsDirPath: string;
  publicDirPath: string;
  /** Root-absolute URL prefixes Astro and Vite generate (optimized images, bundled assets). */
  generatedPathPrefixes: string[];
};

export type TProcessPageOptions = {
  sourceDocFilePath: string;
  site: TLocalLinksSite;
  validate: false | { skipPatterns: string[] };
  normalize: boolean;
};

export type TBrokenLink = {
  href: string;
  reason: string;
};

export type TPageBrokenLinks = {
  sourceDocFilePath: string;
  brokenLinks: TBrokenLink[];
};

/** What the integration resolved from its options and Astro's config. */
export type TLocalLinksSettings = Omit<
  TProcessPageOptions,
  "sourceDocFilePath"
>;

/** The route Starlight renders every source doc through. */
export const STARLIGHT_DOCS_ROUTE = "/[...slug]";

/** Virtual module the dev middleware reads the integration's settings from. */
export const SETTINGS_MODULE_ID = "virtual:astro-local-links/settings";

/** The attribute that holds the link value, per link-bearing element. */
const LINK_ATTRIBUTE_BY_TAG_NAME = { a: "href", img: "src" } as const;

/** Authors put this on a raw HTML link to skip link validation for it. */
const NO_LINK_CHECK_ATTRIBUTE = "data-no-link-check";

/**
 * Resolves, validates and normalizes every local link in one page's final HTML.
 * Returns the rewritten HTML and every broken link found.
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

    if (options.validate && isInContent && !isValidationSkipped) {
      const fragment = suffix.includes("#")
        ? suffix.slice(suffix.indexOf("#"))
        : "";
      const isSkippedByPattern =
        sitePath !== null &&
        options.validate.skipPatterns.some((pattern) =>
          minimatch(sitePath + fragment, pattern),
        );
      const reason = isSkippedByPattern
        ? null
        : sitePath === null
          ? "points outside the docs dir"
          : findMissingTargetReason(sitePath, options.site);
      if (reason) brokenLinks.push({ href: writtenHref, reason });
    }

    if (options.normalize && isRelative && sitePath !== null) {
      setAttribute(element, attribute, sitePath + suffix);
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

/** Why nothing on the site is served at `sitePath`, or null if something is. */
function findMissingTargetReason(
  sitePath: string,
  site: TLocalLinksSite,
): string | null {
  const docsRelativePagePath = toDocsRelativePagePath(sitePath);
  if (docsRelativePagePath === null)
    return `malformed URL encoding in ${sitePath}`;
  if (isFile(join(site.publicDirPath, docsRelativePagePath))) return null;

  if (!/\.[a-z0-9]+$/i.test(docsRelativePagePath)) {
    const sourceDocFilePaths = findSourceDocFilePaths(
      docsRelativePagePath,
      site.docsDirPath,
    );
    if (sourceDocFilePaths.length === 1) return null;
    if (sourceDocFilePaths.length > 1) {
      return `ambiguous, matches ${sourceDocFilePaths.join(" and ")}`;
    }
  }
  return `no source doc or public file at ${sitePath}`;
}

/**
 * The source docs that could render the page at `docsRelativePagePath`: `x.md(x)` or
 * `x/index.md(x)`. More than one means the page is ambiguous.
 */
export function findSourceDocFilePaths(
  docsRelativePagePath: string,
  docsDirPath: string,
): string[] {
  const candidateFilePaths = [
    join(docsDirPath, docsRelativePagePath, "index.md"),
    join(docsDirPath, docsRelativePagePath, "index.mdx"),
  ];
  if (docsRelativePagePath) {
    candidateFilePaths.push(
      join(docsDirPath, `${docsRelativePagePath}.md`),
      join(docsDirPath, `${docsRelativePagePath}.mdx`),
    );
  }
  return candidateFilePaths.filter(isFile);
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
 * when both `x.md` and `x/index.md` exist, since Astro renders both to the same page.
 */
export function resolveSourceDoc(
  pathname: string,
  docsDirPath: string,
): string {
  const docsRelativePagePath = toDocsRelativePagePath(pathname) ?? pathname;
  const sourceDocFilePaths = findSourceDocFilePaths(
    docsRelativePagePath,
    docsDirPath,
  );
  if (sourceDocFilePaths.length === 1) return sourceDocFilePaths[0];

  if (sourceDocFilePaths.length === 0) {
    throw new Error(
      `[astro-local-links] No source doc for ${pathname}. Expected one of ` +
        `${docsRelativePagePath || "."}/index.md(x) or ${docsRelativePagePath}.md(x) under ${docsDirPath}.`,
    );
  }
  throw new Error(
    `[astro-local-links] Ambiguous source docs for ${pathname}: ` +
      `${sourceDocFilePaths.join(", ")}. Astro renders a folder's index.md and a ` +
      `same-named .md one level up to the same page. Remove one of them.`,
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
  return (
    `[astro-local-links] ${brokenLinkCount} broken local link` +
    `${brokenLinkCount === 1 ? "" : "s"}:\n${pageSections.join("\n")}`
  );
}

/**
 * Runs `processPage` on the HTML of the Starlight doc page at URL `pathname`, after finding
 * its source doc. `pageBrokenLinks` is null when the page has none.
 */
export function processDocPage(
  pathname: string,
  html: string,
  settings: TLocalLinksSettings,
) {
  const sourceDocFilePath = resolveSourceDoc(
    pathname,
    settings.site.docsDirPath,
  );
  const processedPage = processPage(html, { sourceDocFilePath, ...settings });
  const pageBrokenLinks: TPageBrokenLinks | null =
    processedPage.brokenLinks.length > 0
      ? { sourceDocFilePath, brokenLinks: processedPage.brokenLinks }
      : null;
  return { html: processedPage.html, pageBrokenLinks };
}
