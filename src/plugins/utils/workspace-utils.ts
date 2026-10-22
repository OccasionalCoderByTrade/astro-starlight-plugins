import { parseFrontmatter as astroParseFrontmatter } from "@astrojs/markdown-remark";
import * as fs from "fs";

type TFrontmatter = {
  title?: string;
  draft?: boolean;
  pagefind?: boolean;
  sidebar?: {
    hidden?: boolean;
  };
};

/** A source doc's frontmatter. Throws when the file can't be read or its YAML is malformed. */
export function parseFrontmatter(filePath: string): TFrontmatter {
  const content = fs.readFileSync(filePath, "utf-8");

  try {
    const { frontmatter } = astroParseFrontmatter(content);
    return frontmatter as TFrontmatter;
  } catch (err) {
    throw new Error(
      `[parseFrontmatter] Failed to parse frontmatter in ${filePath}: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * The extensions Starlight's docs loader reads source docs from. Matched case-sensitively,
 * like the loader's glob.
 */
export const SOURCE_DOC_EXTENSIONS = [
  ".md",
  ".mdx",
  ".markdown",
  ".mdown",
  ".mkdn",
  ".mkd",
  ".mdwn",
];

/**
 * Whether `filePath` is a regular file. False when nothing is at it (or a parent isn't a
 * dir); throws on any other stat error, such as EACCES.
 */
export function isFile(filePath: string): boolean {
  return fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}
