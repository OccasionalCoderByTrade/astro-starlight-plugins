import { JSDOM } from "jsdom";
import { existsSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import { STARLIGHT_CONTENT_SELECTOR } from "../utils/starlight-selectors.js";

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
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const brokenLinks: TBrokenLink[] = [];
  let hasChanged = false;

  const selector = Object.keys(LINK_ATTRIBUTE_BY_TAG_NAME).join(", ");
  for (const element of document.querySelectorAll(selector)) {
    const tagName =
      element.tagName.toLowerCase() as keyof typeof LINK_ATTRIBUTE_BY_TAG_NAME;
    const attribute = LINK_ATTRIBUTE_BY_TAG_NAME[tagName];
    const writtenHref = element.getAttribute(attribute);
    if (!writtenHref) continue;

    // skip markers are written by authors, so they only mean something inside the content
    const isInContent = element.closest(STARLIGHT_CONTENT_SELECTOR) !== null;
    let href = writtenHref;
    let isValidationSkipped = false;
    if (isInContent && href.startsWith("?")) {
      href = href.slice(1);
      isValidationSkipped = true;
    }
    if (isInContent && element.hasAttribute(NO_LINK_CHECK_ATTRIBUTE)) {
      element.removeAttribute(NO_LINK_CHECK_ATTRIBUTE);
      isValidationSkipped = true;
    }
    if (href !== writtenHref) element.setAttribute(attribute, href);
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
      element.setAttribute(attribute, sitePath + suffix);
      hasChanged = true;
    }
  }

  return { html: hasChanged ? dom.serialize() : html, brokenLinks };
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
