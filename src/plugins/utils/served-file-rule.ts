import { statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import { parseFrontmatter } from "./workspace-utils.js";

/** Decides whether a path relative to the docs directory is served. */
export type ServedFileRule = (relativePath: string) => boolean;

function isSourceDoc(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".mdx");
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * The served-file rule for a docs directory. A path relative to it isn't served when any
 * of its segments starts with `_` or `.`, when it or a parent dir matches one of
 * `ignorePatterns`, or when it's a source doc with `draft: true`. Applies to dirs too, so a
 * walk can skip a whole dir. Throws, naming the file, when a source doc's frontmatter can't
 * be parsed, since it can't tell whether that doc is a draft.
 */
export function createServedFileRule(options: {
  docsDirPath: string;
  ignorePatterns: string[];
}): ServedFileRule {
  const { docsDirPath, ignorePatterns } = options;

  return (relativePath) => {
    const segments = relativePath.split(sep).join("/").split("/").filter(Boolean);
    if (segments.some((segment) => /^[_.]/.test(segment))) return false;

    const isIgnored = segments.some((_, i) => {
      const relativeAncestorPath = segments.slice(0, i + 1).join("/");
      return ignorePatterns.some((pattern) =>
        minimatch(relativeAncestorPath, pattern, { dot: true }),
      );
    });
    if (isIgnored) return false;

    const filePath = resolve(docsDirPath, relativePath);
    if (isSourceDoc(filePath) && isFile(filePath)) {
      return parseFrontmatter(filePath).draft !== true;
    }
    return true;
  };
}
