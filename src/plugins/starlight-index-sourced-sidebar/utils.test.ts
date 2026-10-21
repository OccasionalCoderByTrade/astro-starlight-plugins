import { chmodSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { getIndexSourcedSidebarItems } from "./utils.js";

describe("getIndexSourcedSidebarItems", () => {
  it("skips links in an index that don't resolve to a doc", () => {
    const rootDirPath = makeFileTree({
      "guides/index.md":
        "---\ntitle: Guides\n---\n\n[Setup](./setup) [Diagram](./diagram.png) [Gone](./gone)\n",
      "guides/setup.md": "---\ntitle: Setup\n---\n",
      "guides/diagram.png": "png",
    });

    expect(getIndexSourcedSidebarItems(join(rootDirPath, "guides"))).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "index" },
          { label: "Setup", slug: "setup" },
        ],
      },
    ]);
  });

  it("throws when an index can't be read", () => {
    const rootDirPath = makeFileTree({
      "guides/index.md": "---\ntitle: Guides\n---\n",
    });
    const indexFilePath = join(rootDirPath, "guides/index.md");
    chmodSync(indexFilePath, 0o000);

    expect(() =>
      getIndexSourcedSidebarItems(join(rootDirPath, "guides")),
    ).toThrow(/EACCES/);
  });
});
