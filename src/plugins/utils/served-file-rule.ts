import { extname, resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import {
  isFile,
  parseFrontmatter,
  SOURCE_DOC_EXTENSIONS,
} from "./workspace-utils.js";

/**
 * Decides whether a file or dir is served, given its path relative to the docs directory.
 */
export type ServedFileRule = (docsRelativeEntryPath: string) => boolean;

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

  return (docsRelativeEntryPath) => {
    const segments = docsRelativeEntryPath
      .split(sep)
      .join("/")
      .split("/")
      .filter(Boolean);
    if (segments.some((segment) => /^[_.]/.test(segment))) return false;

    const isIgnored = segments.some((_, i) => {
      const docsRelativeAncestorPath = segments.slice(0, i + 1).join("/");
      return ignorePatterns.some((pattern) =>
        minimatch(docsRelativeAncestorPath, pattern, { dot: true }),
      );
    });
    if (isIgnored) return false;

    const entryPath = resolve(docsDirPath, docsRelativeEntryPath);
    if (
      SOURCE_DOC_EXTENSIONS.includes(extname(entryPath)) &&
      isFile(entryPath)
    ) {
      return parseFrontmatter(entryPath).draft !== true;
    }
    return true;
  };
}
