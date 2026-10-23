import { extname, resolve, sep } from "node:path";
import { minimatch } from "minimatch";
import { isFile, parseFrontmatter } from "./workspace-utils.js";

/**
 * Decides whether a file or dir is served, given its path relative to the docs directory.
 */
export type ServedFileRule = (docsRelativeEntryPath: string) => boolean;

/**
 * The served-file rule for a docs directory. A path relative to it isn't served when any
 * of its segments starts with `_` or `.` or holds `?` or `#`, when it or a parent dir matches one of
 * `ignorePatterns`, or when it's a source doc (a file with one of `sourceDocExtensions`) with
 * `draft: true` and `serveDrafts` is off.
 * Applies to dirs too, so a walk can skip a whole dir. Throws, naming the file, when a
 * source doc's frontmatter can't be parsed, since it can't tell whether that doc is a draft.
 * `serveDrafts` matches Starlight, which renders drafts in dev and drops them from builds.
 * Astro decodes a request path with `decodeURI`, which leaves `%3F` and `%23` encoded, so a
 * route param can't hold `?` or `#`: the docs file route couldn't read such a file in dev,
 * and a build would write it under a name no request reaches.
 */
export function createServedFileRule(options: {
  docsDirPath: string;
  ignorePatterns: string[];
  serveDrafts: boolean;
  sourceDocExtensions: string[];
}): ServedFileRule {
  const { docsDirPath, ignorePatterns, serveDrafts, sourceDocExtensions } =
    options;

  return (docsRelativeEntryPath) => {
    const segments = docsRelativeEntryPath
      .split(sep)
      .join("/")
      .split("/")
      .filter(Boolean);
    if (segments.some((segment) => /^[_.]|[?#]/.test(segment))) return false;

    const isIgnored = segments.some((_, i) => {
      const docsRelativeAncestorPath = segments.slice(0, i + 1).join("/");
      return ignorePatterns.some((pattern) =>
        minimatch(docsRelativeAncestorPath, pattern, { dot: true }),
      );
    });
    if (isIgnored) return false;

    const entryPath = resolve(docsDirPath, docsRelativeEntryPath);
    if (sourceDocExtensions.includes(extname(entryPath)) && isFile(entryPath)) {
      // Parsed even when drafts are served, so unparseable frontmatter fails in both modes
      const isDraft = parseFrontmatter(entryPath).draft === true;
      return serveDrafts || !isDraft;
    }
    return true;
  };
}
