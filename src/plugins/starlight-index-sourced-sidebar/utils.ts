import * as fs from "fs";
import * as path from "path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parseFrontmatter } from "../utils/workspace-utils";
import type { TSidebarItem } from "./types";

const SITE_DOCS_ROOT = "./src/content/docs";

function pathSegmentToLabel(segment: string): string {
  let label = segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const match = label.match(/^([a-z]+) [0-9]{2,}/i);
  if (match) {
    const firstGroup = match[1];
    label = firstGroup.toUpperCase() + label.substring(firstGroup.length);
  }

  return label;
}

function findIndexMd(dirPath: string): string | null {
  for (const name of ["index.md", "index.mdx"]) {
    const fullPath = path.join(dirPath, name);
    try {
      if (fs.statSync(fullPath).isFile()) return path.resolve(fullPath);
    } catch {
      /* continue */
    }
  }
  return null;
}

function findMarkdownFile(basePath: string): string | null {
  for (const ext of [".md", ".mdx"]) {
    const fullPath = basePath + ext;
    try {
      if (fs.statSync(fullPath).isFile()) return path.resolve(fullPath);
    } catch {
      /* continue */
    }
  }
  return null;
}

function filePathToSlug(absFilePath: string): string {
  const absDocsRoot = path.resolve(SITE_DOCS_ROOT).replace(/\\/g, "/");
  const normalized = absFilePath.replace(/\\/g, "/");

  let relative: string;
  if (normalized.startsWith(absDocsRoot + "/")) {
    relative = normalized.slice(absDocsRoot.length + 1);
  } else {
    relative = path.basename(absFilePath);
  }

  return relative.replace(/\.(mdx?)$/, "");
}

function normalizeSlug(slug: string): string {
  return slug.endsWith("/index") ? slug.slice(0, -6) : slug;
}

function extractMarkdownLinks(filePath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  // Strip YAML frontmatter before handing to the parser
  content = content.replace(/^---[\s\S]*?---\s*\n/, "");

  const tree = unified().use(remarkParse).parse(content);
  const hrefs: string[] = [];

  visit(tree, "link", (node) => {
    if ("url" in node && typeof node.url === "string") {
      hrefs.push(node.url);
    }
  });

  return hrefs;
}

function isExternal(href: string): boolean {
  return (
    /^https?:\/\//.test(href) ||
    href.startsWith("//") ||
    href.startsWith("mailto:")
  );
}

function tryResolveMarkdownFile(
  href: string,
  currentDir: string,
): string | null {
  const hrefPath = href.split("?")[0].split("#")[0].trim();
  const resolved = path.resolve(currentDir, hrefPath);

  // If href already carries a markdown extension, check that exact path
  if (/\.(mdx?)$/.test(hrefPath)) {
    try {
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch {
      /* not found */
    }
    return null;
  }

  return findMarkdownFile(resolved);
}

function buildItems(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  visited: Set<string>,
  indexMarker: string | undefined,
): TSidebarItem[] {
  const absDir = path.resolve(dirPath);

  if (visited.has(absDir)) return [];
  visited.add(absDir);

  const indexFile = findIndexMd(absDir);
  if (!indexFile) {
    throw new Error(
      `[starlight-index-sourced-sidebar] No index.md or index.mdx found in "${absDir}"`,
    );
  }

  const fm = parseFrontmatter(indexFile);
  if (fm.draft || fm.pagefind === false || fm.sidebar?.hidden) return [];

  const items: TSidebarItem[] = [];

  // The index page itself is always the first item in its group
  const indexBaseLabel = fm.title ?? pathSegmentToLabel(path.basename(absDir));
  items.push({
    label: indexMarker ? `${indexMarker} ${indexBaseLabel}` : indexBaseLabel,
    slug: normalizeSlug(filePathToSlug(indexFile)),
  });

  for (const href of extractMarkdownLinks(indexFile)) {
    if (isExternal(href)) continue;

    // Pure anchor links (#section) resolve to nothing — skip
    const hrefPath = href.split("?")[0].split("#")[0].trim();
    if (!hrefPath) continue;

    const resolvedFile = tryResolveMarkdownFile(href, path.dirname(indexFile));
    if (!resolvedFile) continue;

    const isSubIndex =
      hrefPath.endsWith("/index") ||
      hrefPath.endsWith("/index.md") ||
      hrefPath.endsWith("/index.mdx");

    if (isSubIndex) {
      const subDirPath = path.dirname(resolvedFile);

      if (resolvedFile.endsWith(".mdx")) {
        // index.mdx: add as a leaf item only — do not recurse into it
        const subFm = parseFrontmatter(resolvedFile);
        if (subFm.draft || subFm.pagefind === false || subFm.sidebar?.hidden)
          continue;
        const subBaseLabel =
          subFm.title ?? pathSegmentToLabel(path.basename(subDirPath));
        items.push({
          label: indexMarker ? `${indexMarker} ${subBaseLabel}` : subBaseLabel,
          slug: normalizeSlug(filePathToSlug(resolvedFile)),
        });
      } else {
        // index.md: recurse and build a group (or flatten if at max depth)
        const subItems = buildItems(
          subDirPath,
          currentDepth + 1,
          maxDepth,
          visited,
          indexMarker,
        );
        if (subItems.length === 0) continue;

        if (currentDepth + 1 >= maxDepth) {
          items.push(...subItems);
        } else {
          items.push({
            label: pathSegmentToLabel(path.basename(subDirPath)),
            items: subItems,
          });
        }
      }
    } else {
      const leafFm = parseFrontmatter(resolvedFile);
      if (leafFm.draft || leafFm.pagefind === false || leafFm.sidebar?.hidden)
        continue;

      items.push({
        label:
          leafFm.title ??
          pathSegmentToLabel(
            path.basename(resolvedFile, path.extname(resolvedFile)),
          ),
        slug: normalizeSlug(filePathToSlug(resolvedFile)),
      });
    }
  }

  return items;
}

export function getIndexSourcedSidebarItems(
  directory: string,
  maxDepthNesting: number = 100,
  indexMarker?: string,
): TSidebarItem[] {
  const absDir = path.resolve(directory);
  const rootGroupLabel = pathSegmentToLabel(path.basename(absDir));
  const items = buildItems(
    absDir,
    0,
    maxDepthNesting,
    new Set<string>(),
    indexMarker,
  );

  if (items.length === 0) return [];

  return [{ label: rootGroupLabel, items }];
}
