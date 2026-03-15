import { existsSync } from "fs";
import { sync as globSync } from "glob";
import type { Element, Root } from "hast";
import { dirname, join, relative, resolve } from "path";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";

const PROJECT_DOCS_DIR = "src/content/docs";

type TLink = {
  original_href: string;
  project_absolute_href: string; // can be a glob pattern if it's a markdown link without extension
  site_absolute_href: string;
  fragment: string;
};

function getResolvedLink(href: string, currentFilePath: string): TLink | null {
  try {
    new URL(href);
    return null; // constructed successfully, it's an external link
  } catch {
    // if exception, then it's not an external resource
  }

  // skip empty links
  if (!href) {
    return null;
  }

  const fragmentMatch = href.split("#");
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
  };
}

function validateLink(link: TLink): void {
  const { project_absolute_href } = link;

  if (project_absolute_href.includes(".{md,mdx}")) {
    const matches = globSync(project_absolute_href);

    if (matches.length === 0) {
      throw new Error(
        `Link validation error: No matching file found for: ${link.original_href} (pattern: ${project_absolute_href})`
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Link validation error: Multiple matching files found: ${matches.join(
          ", "
        )} (from link: ${link.original_href})`
      );
    }
  } else {
    // if not a glob pattern, check directly
    if (!existsSync(project_absolute_href)) {
      throw new Error(
        `Link validation error: File not found: ${project_absolute_href} (from link: ${link.original_href})`
      );
    }
  }
}

/**
 * Rehype plugin to validate all internal links and convert them to absolute paths
 */
export function rehypeValidateLinks() {
  return (tree: Root, file: VFile) => {
    const filePath = file.path;

    if (!filePath) {
      console.warn(
        "rehype-validate-links: Unable to determine file path for link validation. Skipping link validation for this file."
      );
      return;
    }

    visit(tree, "element", (node: Element) => {
      let resourcePath: string | undefined;
      let attributeName: string | null = null;

      if (node.tagName === "a") {
        resourcePath = node.properties?.href as string | undefined;
        attributeName = "href";
      } else if (node.tagName === "img") {
        resourcePath = node.properties?.src as string | undefined;
        attributeName = "src";
      }

      if (!resourcePath || !attributeName) return;

      const link = getResolvedLink(resourcePath, filePath);
      if (!link) return;

      validateLink(link);

      node.properties = node.properties || {};
      node.properties[attributeName] = link.site_absolute_href;
    });
  };
}

export default rehypeValidateLinks;
