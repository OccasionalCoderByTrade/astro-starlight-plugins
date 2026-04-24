import { minimatch } from "minimatch";

export const PROJECT_DOCS_DIR = "src/content/docs";

const EXTERNAL_SCHEMES = [
  "http://",
  "https://",
  "ftp://",
  "ftps://",
  "sftp://",
  "ssh://",
  "git://",
  "svn://",
  "irc://",
  "ircs://",
  "ws://",
  "wss://",
];

export function isExternalHref(href: string): boolean {
  return EXTERNAL_SCHEMES.some((scheme) => href.startsWith(scheme));
}

/**
 * Check if a path matches any of the given glob patterns
 */
export function matchesGlobPatterns(
  path: string,
  patterns: string[] | undefined,
): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => minimatch(path, pattern));
}
