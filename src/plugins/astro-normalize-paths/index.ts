import { existsSync } from "fs";
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "glob";
import { dirname, relative, resolve } from "path";
import type { AstroIntegration } from "astro";
import { JSDOM } from "jsdom";

const SRC_CONTENT_ROOT = "src/content/docs/";

// the element attributes that we can access to to read/set the link value
// via which to read/set element.setAttribute(attribute, "newHrefValue");
const LINK_ELEMENT_TO_ACCESSOR_MAP = {
  img: "src",
  a: "href",
};

class LinkElement {
  private _element: HTMLElement;
  private _accessor: string;
  private _href: string;

  constructor(element: HTMLElement) {
    this._element = element;
    this._accessor = this.getAccessorName();
    this._href = this.extractHref(element);
  }

  get href() {
    return this._href;
  }

  set href(newHref: string) {
    this._href = newHref;
    this._element.setAttribute(this._accessor, newHref);
  }

  private getAccessorName(): string {
    const tagName =
      this._element.tagName.toLowerCase() as keyof typeof LINK_ELEMENT_TO_ACCESSOR_MAP;
    return LINK_ELEMENT_TO_ACCESSOR_MAP[tagName];
  }

  private extractHref(element: HTMLElement): string {
    return element.getAttribute(this._accessor) ?? "";
  }
}

/**
 * Astro integration that rewrites relative link hrefs in built HTML files to absolute site paths.
 *
 * Relative links break when web hosts differ in whether they append a trailing slash to URLs.
 * This integration runs after the build, resolves every relative href against the original
 * source file's location, and replaces it with an absolute path so behaviour is host-independent.
 */
export function astroNormalizePaths(): AstroIntegration {
  return {
    name: "astro-normalize-paths",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const htmlFiles = await glob(`${dir.pathname}/**/*.html`);
        const distRoot = dir.pathname.replace(/\/+$/, "");

        await Promise.all(
          htmlFiles.map(async (htmlFilePath: string) => {
            if (!htmlFilePath.endsWith("/index.html")) return;

            const dom = new JSDOM(await readFile(htmlFilePath, "utf-8"));
            const document = dom.window.document;

            let hasHtmlContentChanged = false;

            const sourceFilePath = resolveSourceFile(htmlFilePath, distRoot); // distRoot/path/to/file.html -> src/content/docs/file.md
            const linkElements = getLinks(document);

            for (const link of linkElements) {
              if (!isRelativePath(link.href)) continue;

              const normalizedLinkPath = normalizeAssetPath(
                link.href,
                sourceFilePath,
              ); // src/content/docs/source_file.md + ./ref/page = src/content/docs/ref/page -> /ref/page

              link.href = normalizedLinkPath;
              hasHtmlContentChanged = true;
            }

            if (hasHtmlContentChanged) {
              await writeFile(htmlFilePath, dom.serialize(), "utf-8");
            }
          }),
        );
      },
    },
  };
}

/** Queries all link-bearing elements from the document and wraps them as `LinkElement` instances. */
function getLinks(document: Document): LinkElement[] {
  const selector = Object.keys(LINK_ELEMENT_TO_ACCESSOR_MAP).join(", ");
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map((el) => new LinkElement(el as HTMLElement));
}

/**
 * Given an absolute path to a built `index.html` file, returns the cwd-relative path of the
 * source markdown file it was compiled from (e.g. `src/content/docs/reference/schemas.md`).
 *
 * Astro is ambiguous: both `reference/schemas/index.md` and `reference/schemas.md` produce
 * `dist/reference/schemas/index.html`. This function resolves the ambiguity by checking which
 * candidate source files actually exist. If exactly one exists it is returned; otherwise an
 * error is thrown directing the user to fix the collision in their file structure.
 */
function resolveSourceFile(
  htmlFilePath: string, // absolute path
  distRoot: string, // absolute path
): string {
  const normalizedDistDir = distRoot.replace(/\/+$/, "");
  const srcDir = SRC_CONTENT_ROOT.replace(/\/+$/, "");

  const relativeHtmlPath = htmlFilePath
    .slice(normalizedDistDir.length)
    .replace(/^\/+/, "");

  if (
    relativeHtmlPath !== "index.html" &&
    !relativeHtmlPath.endsWith("/index.html")
  ) {
    throw new Error(
      `resolveSourceFile: expected a path ending in index.html, got: ${htmlFilePath}`,
    );
  }

  const relativeDir =
    relativeHtmlPath === "index.html"
      ? ""
      : relativeHtmlPath.slice(0, -"/index.html".length);

  const baseDir = relativeDir ? `${srcDir}/${relativeDir}` : srcDir;
  const candidates = [`${baseDir}/index.md`, `${baseDir}/index.mdx`];

  if (relativeDir) {
    candidates.push(
      `${srcDir}/${relativeDir}.md`,
      `${srcDir}/${relativeDir}.mdx`,
    );
  }

  const matches = candidates.filter(existsSync);

  if (matches.length === 1) return matches[0];

  if (matches.length === 0) {
    throw new Error(
      `[astro-normalize-paths] Could not find a source file for ${htmlFilePath}. ` +
        `Expected one of: ${candidates.join(", ")}`,
    );
  }

  throw new Error(
    `[astro-normalize-paths] Ambiguous source files for ${htmlFilePath}: ${matches.join(", ")}. ` +
      `Astro can compile both a directory index file (e.g. reference/schemas/index.md) and a ` +
      `same-named file one level up (e.g. reference/schemas.md) into the same output path. ` +
      `Remove one of the conflicting files to resolve this.`,
  );
}

/**
 * Resolves a relative link href against the source file's location and returns an absolute
 * site path (e.g. a relative link `./ref/page` in `src/content/docs/guide/intro.md` resolves to `/guide/ref/page`).
 */
function normalizeAssetPath(
  relLinkHref: string,
  sourceFilePath: string,
): string {
  // Strip fragment and query string before path resolution, reattach after
  let suffix = "";
  let href = relLinkHref;

  const hashIdx = href.indexOf("#");
  if (hashIdx !== -1) {
    suffix = href.slice(hashIdx);
    href = href.slice(0, hashIdx);
  }

  const queryIdx = href.indexOf("?");
  if (queryIdx !== -1) {
    suffix = href.slice(queryIdx) + suffix;
    href = href.slice(0, queryIdx);
  }

  const absoluteLinkedPath = resolve(dirname(sourceFilePath), href);
  const relToRoot = relative(process.cwd(), absoluteLinkedPath);
  const srcContentRoot = SRC_CONTENT_ROOT.replace(/\/+$/, "");
  const relToContentRoot = relToRoot.startsWith(srcContentRoot)
    ? relToRoot.slice(srcContentRoot.length).replace(/^\/+/, "")
    : relToRoot;

  return "/" + relToContentRoot.replace(/\\/g, "/") + suffix;
}

/** Returns true if the href is a relative path that should be resolved and rewritten. */
function isRelativePath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !path.startsWith("http://") &&
    !path.startsWith("https://") &&
    !path.startsWith("data:") &&
    !path.startsWith("#") &&
    !path.startsWith("mailto:")
  );
}
