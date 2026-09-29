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

export function parseFrontmatter(filePath: string): TFrontmatter {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return {};
  }

  try {
    const { frontmatter } = astroParseFrontmatter(content);
    return frontmatter as TFrontmatter;
  } catch (err) {
    console.warn(
      `[parseFrontmatter] Failed to parse frontmatter in ${filePath}:`,
      err,
    );
    return {};
  }
}
