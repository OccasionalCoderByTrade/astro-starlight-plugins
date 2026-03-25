import { dirname, resolve } from "path";
import { minimatch } from "minimatch";

const PROJECT_DOCS_DIR = "src/content/docs";

/**
 * Check if a path is an external URL, data URI, or absolute path
 */
export function isExternalPath(path: string): boolean {
  return path.startsWith("http") || path.startsWith("data:") || path.startsWith("/");
}

/**
 * Check if a path matches any of the given skip patterns
 */
export function matchesSkipPattern(path: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => minimatch(path, pattern));
}

/**
 * Normalize a relative path to an absolute site path
 * Resolves relative to the given file's directory and converts to absolute path from site root
 */
export function normalizePath(
  path: string,
  fromFilePath: string,
  siteRootPath: string
): string | null {
  // Skip external URLs, data URIs, and absolute paths
  if (isExternalPath(path)) {
    return null;
  }

  // For relative paths, resolve relative to the file's directory
  const fileDir = dirname(fromFilePath);
  const resolvedPath = resolve(fileDir, path);

  // Convert to absolute site path
  const siteRoot = resolve(siteRootPath);
  return "/" + resolve(resolvedPath).slice(siteRoot.length).replace(/\\/g, "/");
}

export { PROJECT_DOCS_DIR };
