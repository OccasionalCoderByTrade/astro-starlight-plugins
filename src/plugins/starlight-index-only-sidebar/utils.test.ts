import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { getIndexMdSidebarItems } from "./utils.js";

describe("getIndexMdSidebarItems", () => {
  it("builds a group per subdirectory that has an index", () => {
    const rootDirPath = makeFileTree({
      "guides/index.md": "---\ntitle: Guides\n---\n",
      "guides/setup/index.md": "---\ntitle: Setup\n---\n",
      "guides/drafts/index.md": "---\ndraft: true\n---\n",
    });

    expect(getIndexMdSidebarItems(join(rootDirPath, "guides"))).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Overview", slug: "guides/index" },
          {
            label: "Setup",
            items: [{ label: "Overview", slug: "guides/setup/index" }],
          },
        ],
      },
    ]);
  });

  it("throws when the directory doesn't exist", () => {
    const rootDirPath = makeFileTree({});
    const missingDirPath = join(rootDirPath, "guides");

    expect(() => getIndexMdSidebarItems(missingDirPath)).toThrow(
      missingDirPath,
    );
  });
});
