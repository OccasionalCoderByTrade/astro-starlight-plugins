import { join } from "node:path";
import { isFile } from "./workspace-utils.js";

/**
 * The path of the sidebar index in `dirPath` (`index` plus the first of
 * `sourceDocExtensions` that exists), or null when it has none. Throws on stat errors other
 * than a missing file, such as EACCES.
 */
export function findSidebarIndexFile(
  dirPath: string,
  sourceDocExtensions: string[],
): string | null {
  for (const extension of sourceDocExtensions) {
    const indexFilePath = join(dirPath, `index${extension}`);
    if (isFile(indexFilePath)) return indexFilePath;
  }
  return null;
}
