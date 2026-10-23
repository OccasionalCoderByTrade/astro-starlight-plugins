import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { getSourceDocExtensions, parseFrontmatter } from "./workspace-utils.js";

describe("getSourceDocExtensions", () => {
  it("is .md and .mdx without Markdoc", () => {
    expect(getSourceDocExtensions([{ name: "@astrojs/starlight" }])).toEqual([
      ".md",
      ".mdx",
    ]);
  });

  it("adds .mdoc when the Markdoc integration is in Astro's config", () => {
    expect(
      getSourceDocExtensions([
        { name: "@astrojs/starlight" },
        { name: "@astrojs/markdoc" },
      ]),
    ).toEqual([".md", ".mdx", ".mdoc"]);
  });
});

describe("parseFrontmatter", () => {
  it("returns a doc's frontmatter", () => {
    const rootDirPath = makeFileTree({
      "page.md": "---\ntitle: Page\ndraft: true\n---\n\nBody",
    });

    expect(parseFrontmatter(join(rootDirPath, "page.md"))).toEqual({
      title: "Page",
      draft: true,
    });
  });

  it("throws, naming the file, when the YAML is malformed", () => {
    const rootDirPath = makeFileTree({
      "broken.md": "---\ntitle: [unclosed\n---\n\nBody",
    });
    const filePath = join(rootDirPath, "broken.md");

    expect(() => parseFrontmatter(filePath)).toThrow(filePath);
    expect(() => parseFrontmatter(filePath)).toThrow(/\(3:1\)|line 3, column 1/); // markdown-remark 6 | 7 wording
  });

  it("throws when the file can't be read", () => {
    const rootDirPath = makeFileTree({ "not-a-file.md/": "" });

    expect(() => parseFrontmatter(join(rootDirPath, "not-a-file.md"))).toThrow(
      /EISDIR/,
    );
  });
});
