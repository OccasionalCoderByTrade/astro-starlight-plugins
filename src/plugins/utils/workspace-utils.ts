import { parseFrontmatter as astroParseFrontmatter } from "@astrojs/markdown-remark";
import * as fs from "fs";
import * as path from "path";

/** The frontmatter fields the plugins read from any source doc. */
export type TSourceDocFrontmatter = {
  title?: string;
  slug?: string;
  draft?: boolean;
  pagefind?: boolean;
  sidebar?: {
    hidden?: boolean;
  };
};

/** A source doc's frontmatter and body, from one read. */
export type TSourceDoc<TFrontmatter extends TSourceDocFrontmatter> = {
  frontmatter: TFrontmatter;
  body: string;
};

/**
 * A source doc's frontmatter and body. `TFrontmatter` names the fields the caller reads; it
 * isn't checked. Throws when the file can't be read or its YAML is malformed.
 */
export function parseSourceDoc<
  TFrontmatter extends TSourceDocFrontmatter = TSourceDocFrontmatter,
>(filePath: string): TSourceDoc<TFrontmatter> {
  const content = fs.readFileSync(filePath, "utf-8");

  try {
    const { frontmatter, content: body } = astroParseFrontmatter(content);
    return { frontmatter: frontmatter as TFrontmatter, body };
  } catch (err) {
    throw new Error(
      `[parseFrontmatter] Failed to parse frontmatter in ${filePath}: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * A source doc's frontmatter. `TFrontmatter` names the fields the caller reads; it isn't
 * checked. Throws when the file can't be read or its YAML is malformed.
 */
export function parseFrontmatter<
  TFrontmatter extends TSourceDocFrontmatter = TSourceDocFrontmatter,
>(filePath: string): TFrontmatter {
  return parseSourceDoc<TFrontmatter>(filePath).frontmatter;
}

const MARKDOC_INTEGRATION_NAME = "@astrojs/markdoc";

/**
 * The extensions source docs have, given Astro's `config.integrations`: `.md` and `.mdx`,
 * plus `.mdoc` when the Markdoc integration is there, as Starlight's docs loader checks.
 * Its glob also matches `.markdown`, `.mdown`, `.mkdn`, `.mkd` and `.mdwn`, but Astro has
 * no content entry type for those and skips them. Match case-sensitively, like the glob.
 * Called from `astro:config:setup`, so it misses Markdoc added by a later integration's
 * `updateConfig`, which Starlight, checking once content loads, would see.
 */
export function getSourceDocExtensions(
  integrations: { name: string }[],
): string[] {
  const hasMarkdoc = integrations.some(
    ({ name }) => name === MARKDOC_INTEGRATION_NAME,
  );
  return hasMarkdoc ? [".md", ".mdx", ".mdoc"] : [".md", ".mdx"];
}

/**
 * Whether `filePath` is a regular file. False when nothing is at it (or a parent isn't a
 * dir); throws on any other stat error, such as EACCES.
 */
export function isFile(filePath: string): boolean {
  return fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * Whether `dirPath` is a directory. False when nothing is at it (or a parent isn't a dir);
 * throws on any other stat error, such as EACCES.
 */
export function isDir(dirPath: string): boolean {
  return (
    fs.statSync(dirPath, { throwIfNoEntry: false })?.isDirectory() ?? false
  );
}

/** Whether `targetPath` is outside `dirPath` (`dirPath` itself counts as inside). */
export function isOutsideDir(dirPath: string, targetPath: string): boolean {
  const relativeTargetPath = path.relative(dirPath, targetPath);
  return (
    relativeTargetPath === ".." ||
    relativeTargetPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTargetPath)
  );
}
