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
