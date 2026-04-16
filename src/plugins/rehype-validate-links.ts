import { existsSync } from "fs";
import { sync as globSync } from "glob";
import type { Element, Root } from "hast";
import { dirname, join, relative, resolve } from "path";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import { PROJECT_DOCS_DIR, matchesSkipPattern } from "./utils/path-utils.js";

type TLink = {
  original_href: string;
  project_absolute_href: string; // can be a glob pattern if it's a markdown link without extension
  site_absolute_href: string;
  fragment: string;
  skipValidation: boolean; // set to true if href starts with ?
};

type TRehypeValidateLinksOptions = {
  skipPatterns?: string[]; // glob patterns to skip validation (e.g. '/csci-320-331-obrenic/grade-calculator', '**/grade-*')
};

function getResolvedLink(href: string, currentFilePath: string): TLink | null {
  // Check if href starts with ? (skip validation marker)
  let skipValidation = false;
  let processedHref = href;
  if (href.startsWith("?")) {
    skipValidation = true;
    processedHref = href.slice(1); // strip the ?
  }

  try {
    new URL(processedHref);
    return null; // constructed successfully, it's an external link
  } catch {
    // if exception, then it's not an external resource
  }

  // skip empty links
  if (!processedHref) {
    return null;
  }

  const fragmentMatch = processedHref.split("#");
  const withoutFragment = fragmentMatch[0];
  const fragment = fragmentMatch[1] || "";

  // skip hash-only links (fragments with no actual path)
  if (!withoutFragment) {
    return null;
  }

  let projectAbsolute: string;
  let relativePath: string;

  if (withoutFragment.startsWith("/")) {
    // absolute link, resolve from docs root
    relativePath = withoutFragment.slice(1);
    projectAbsolute = join(PROJECT_DOCS_DIR, relativePath);
  } else {
    // Relative link - resolve relative to current file's directory
    const currentFileDir = dirname(currentFilePath);
    const resolvedAbsPath = resolve(currentFileDir, withoutFragment);
    projectAbsolute = resolvedAbsPath;

    // Convert absolute path back to relative from PROJECT_DOCS_DIR
    const docsRootAbsolute = resolve(PROJECT_DOCS_DIR);
    relativePath = relative(docsRootAbsolute, resolvedAbsPath);
  }

  const hasExtension = /\.[a-z0-9]+$/i.test(projectAbsolute);

  let finalProjectAbsoluteHref: string;

  if (!hasExtension) {
    // No extension - create glob pattern for markdown files
    finalProjectAbsoluteHref = `${projectAbsolute}.{md,mdx}`;
  } else {
    // Has extension - use as is
    finalProjectAbsoluteHref = projectAbsolute;
  }

  let siteAbsoluteHref = "/" + relativePath;
  if (fragment) {
    siteAbsoluteHref += "#" + fragment;
  }

  return {
    original_href: href,
    project_absolute_href: finalProjectAbsoluteHref,
    site_absolute_href: siteAbsoluteHref,
    fragment: fragment,
    skipValidation: skipValidation,
  };
}

function validateLink(link: TLink): string | null {
  const { project_absolute_href } = link;

  if (project_absolute_href.includes(".{md,mdx}")) {
    const matches = globSync(project_absolute_href);

    if (matches.length === 0) {
      return `No matching file found for: ${link.original_href} (pattern: ${project_absolute_href})`;
    }

    if (matches.length > 1) {
      return `Multiple matching files found: ${matches.join(", ")} (from link: ${link.original_href})`;
    }
  } else {
    if (!existsSync(project_absolute_href)) {
      return `File not found: ${project_absolute_href} (from link: ${link.original_href})`;
    }
  }

  return null;
}

/**
 * Rehype plugin to validate all internal links (checks validity only, no path normalization).
 * This plugin verifies that link targets exist; path normalization is handled by separate integrations.
 */
export function rehypeValidateLinks(options?: TRehypeValidateLinksOptions) {
  return (tree: Root, file: VFile) => {
    const filePath = file.path;

    if (!filePath) {
      console.warn(
        "rehype-validate-links: Unable to determine file path for link validation. Skipping link validation for this file.",
      );
      return;
    }

    const errors: string[] = [];

    visit(tree, "element", (node: Element) => {
      // Only validate <a> elements (links), not <img> elements
      if (node.tagName !== "a") return;

      const href = node.properties?.href as string | undefined;
      if (!href) return;

      const link = getResolvedLink(href, filePath);
      if (!link) return;

      if (link.skipValidation) return;
      if (node.properties?.["data-no-link-check"] !== undefined) return;
      if (matchesSkipPattern(link.site_absolute_href, options?.skipPatterns))
        return;

      const error = validateLink(link);
      if (error) errors.push(error);
    });

    if (errors.length > 0) {
      throw new Error(
        `Link validation errors in ${filePath}:\n` +
          errors.map((e) => `  - ${e}`).join("\n"),
      );
    }
  };
}

export default rehypeValidateLinks;
