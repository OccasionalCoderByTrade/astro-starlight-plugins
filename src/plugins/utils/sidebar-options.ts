import * as path from "node:path";
import { toDisplayPath } from "./display-path.js";
import { findSidebarIndexFile } from "./sidebar-index.js";
import { isDir, isOutsideDir } from "./workspace-utils.js";

export type TSidebarOptionsToValidate = {
  /** Plugin name used to prefix error messages, e.g. `starlight-index-sourced-sidebar`. */
  pluginName: string;
  /** Absolute path of the project root, which error messages print paths relative to. */
  rootDirPath: string;
  /** Absolute path of Starlight's docs root (`content/docs/` under Astro's `srcDir`). */
  docsDirPath: string;
  /** The `directories` option, as the site author wrote it. */
  directories: string[];
  /** The `maxGroupLevels` option, as the site author wrote it. */
  maxGroupLevels: number | undefined;
  sourceDocExtensions: string[];
};

export type TValidatedSidebarOptions = {
  /** Absolute path of each `directories` entry, in the order given. */
  dirPaths: string[];
  /** Levels of groups allowed, the root group included. `Infinity` when unset. */
  maxGroupLevels: number;
};

/**
 * Checks the options both sidebar plugins share, throwing at startup (ADR 0008) on the
 * first bad one: a `maxGroupLevels` that isn't an integer of at least 1, or a `directories`
 * entry that's outside the docs root, the same directory as an earlier entry, not found,
 * or without a sidebar index. Stat errors other than a missing path, such as EACCES, are
 * thrown as they are.
 */
export function validateSidebarOptions(
  options: TSidebarOptionsToValidate,
): TValidatedSidebarOptions {
  const { pluginName, rootDirPath, directories, sourceDocExtensions } = options;
  const docsDirPath = path.resolve(options.docsDirPath);
  const errorPrefix = `[${pluginName}]`;

  // Only undefined means unlimited: an explicit `Infinity` or `null` is a bad value too
  if (
    options.maxGroupLevels !== undefined &&
    !(Number.isInteger(options.maxGroupLevels) && options.maxGroupLevels >= 1)
  ) {
    throw new Error(
      `${errorPrefix} maxGroupLevels must be an integer of at least 1, got ${options.maxGroupLevels}`,
    );
  }
  const maxGroupLevels = options.maxGroupLevels ?? Infinity;

  const directoryByDirPath = new Map<string, string>();
  for (const directory of directories) {
    const dirPath = path.resolve(docsDirPath, directory);
    if (isOutsideDir(docsDirPath, dirPath)) {
      throw new Error(
        `${errorPrefix} directories entry "${directory}" is outside the docs root ${toDisplayPath(rootDirPath, docsDirPath)}`,
      );
    }

    const earlierDirectory = directoryByDirPath.get(dirPath);
    if (earlierDirectory !== undefined) {
      throw new Error(
        `${errorPrefix} directories entry "${directory}" is the same directory as "${earlierDirectory}"`,
      );
    }
    directoryByDirPath.set(dirPath, directory);

    if (!isDir(dirPath)) {
      throw new Error(
        `${errorPrefix} Directory not found for directories entry "${directory}": ${toDisplayPath(rootDirPath, dirPath)}`,
      );
    }

    if (!findSidebarIndexFile(dirPath, sourceDocExtensions)) {
      const indexFileNames = sourceDocExtensions
        .map((extension) => `index${extension}`)
        .join(" or ");
      throw new Error(
        `${errorPrefix} No sidebar index (${indexFileNames}) for directories entry "${directory}": ${toDisplayPath(rootDirPath, dirPath)}`,
      );
    }
  }

  return { dirPaths: [...directoryByDirPath.keys()], maxGroupLevels };
}
