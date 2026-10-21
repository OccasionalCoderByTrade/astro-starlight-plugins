import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { parseFrontmatter } from "./workspace-utils.js";

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
    expect(() => parseFrontmatter(filePath)).toThrow("(3:1)");
  });

  it("throws when the file can't be read", () => {
    const rootDirPath = makeFileTree({ "not-a-file.md/": "" });

    expect(() => parseFrontmatter(join(rootDirPath, "not-a-file.md"))).toThrow(
      /EISDIR/,
    );
  });
});
