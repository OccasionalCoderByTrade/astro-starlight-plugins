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
