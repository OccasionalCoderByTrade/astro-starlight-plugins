import { parseFrontmatter as astroParseFile } from "@astrojs/markdown-remark";
import * as fs from "fs";

type TFrontmatter = {
  title?: string;
  draft?: boolean;
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
    const { frontmatter } = astroParseFile(content);
    return frontmatter as TFrontmatter;
  } catch (err) {
    console.warn(
      `[parseFrontmatter] Failed to parse frontmatter in ${filePath}:`,
      err,
    );
    return {};
  }
}
