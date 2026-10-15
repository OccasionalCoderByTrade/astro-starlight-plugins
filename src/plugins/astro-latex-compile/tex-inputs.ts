/**
 * Tex input dirs: the directories `tex compile` blocks can pull tex input
 * files from, and the hash that makes compiled tex diagrams depend on them.
 * See docs/adr/0004-tex-input-dirs-are-a-blocks-only-dependencies.md.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { delimiter, join, relative, resolve } from "node:path";

export interface TexInputDir {
  /** The entry as written in `texInputDirs`, for messages. */
  configuredPath: string;
  /** Absolute path of the directory. */
  dirPath: string;
  /** `true` when the entry ends in `//`, searching subdirectories too. */
  recursive: boolean;
}

/**
 * Resolves `texInputDirs` entries against the project root. A trailing `/`
 * searches the directory only, `//` searches it recursively.
 */
export function resolveTexInputDirs(
  rootDirPath: string,
  texInputDirs: string[],
): TexInputDir[] {
  return texInputDirs.map((configuredPath) => ({
    configuredPath,
    dirPath: resolve(rootDirPath, configuredPath.replace(/\/+$/, "")),
    recursive: configuredPath.endsWith("//"),
  }));
}

/**
 * Suffixes of files LaTeX tools and editors leave behind. They usually aren't committed,
 * so counting them would make the hash differ between a dev machine and a
 * prod build that relies on committed compiled tex diagrams.
 */
const LEFTOVER_FILE_SUFFIXES = [
  ".aux",
  ".bcf",
  ".blg",
  ".fdb_latexmk",
  ".fls",
  ".lof",
  ".log",
  ".lot",
  ".out",
  ".run.xml",
  ".synctex",
  ".synctex.gz",
  ".toc",
  ".xdv",
  "~",
];

function isIgnored(entryName: string): boolean {
  return (
    entryName.startsWith(".") ||
    LEFTOVER_FILE_SUFFIXES.some((suffix) => entryName.endsWith(suffix))
  );
}

function collectFiles(dirPath: string, recursive: boolean): string[] {
  const filePaths: string[] = [];
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (isIgnored(entry.name)) continue;
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        filePaths.push(...collectFiles(entryPath, recursive));
      } else if (entry.isFile()) {
        filePaths.push(entryPath);
      }
    }
  } catch {
    // directory missing or unreadable -- skip silently
  }
  return filePaths.sort();
}

/** Every tex input file, in the order they are hashed. */
export function listTexInputFiles(texInputDirs: TexInputDir[]): string[] {
  return texInputDirs.flatMap(({ dirPath, recursive }) =>
    collectFiles(dirPath, recursive),
  );
}

/**
 * Hash of every tex input file's path (relative to the project root) and
 * contents, or `""` when there are none. Folded into every compiled tex
 * diagram's hash, so changing any tex input file recompiles every diagram.
 */
export function hashTexInputs(
  rootDirPath: string,
  texInputDirs: TexInputDir[],
): string {
  const hash = createHash("md5");
  let hasAnyFile = false;
  for (const filePath of listTexInputFiles(texInputDirs)) {
    try {
      hash.update(relative(rootDirPath, filePath));
      hash.update(readFileSync(filePath));
      hasAnyFile = true;
    } catch {
      // skip unreadable files
    }
  }
  return hasAnyFile ? hash.digest("hex").slice(0, 16) : "";
}

/** Entries that don't name an existing directory. */
export function findMissingTexInputDirs(
  texInputDirs: TexInputDir[],
): TexInputDir[] {
  return texInputDirs.filter(({ dirPath }) => {
    try {
      return !statSync(dirPath).isDirectory();
    } catch {
      return true;
    }
  });
}

/**
 * `TEXINPUTS` value searching the tex input dirs first. The trailing empty
 * entry keeps TeX's default search path after them.
 */
export function texInputsSearchPath(
  texInputDirs: TexInputDir[],
  inheritedSearchPath: string | undefined,
): string {
  return [
    ...texInputDirs.map(({ dirPath, recursive }) =>
      recursive ? `${dirPath}//` : dirPath,
    ),
    inheritedSearchPath ?? "",
  ].join(delimiter);
}
