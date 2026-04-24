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

export function isExternalPath(path: string): boolean {
  return EXTERNAL_SCHEMES.some((scheme) => path.startsWith(scheme));
}

/** Returns true if the href is a relative path that should be resolved and rewritten. */
export function isRelativePath(path: string): boolean {
  return (
    !isExternalPath(path) &&
    !path.startsWith("/") &&
    !path.startsWith("data:") &&
    !path.startsWith("#")
  );
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
