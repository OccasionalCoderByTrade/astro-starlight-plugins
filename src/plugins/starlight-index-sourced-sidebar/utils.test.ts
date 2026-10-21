import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRunningAsRoot,
  lockPath,
  makeFileTree,
  unlockAll,
} from "../tests/file-tree.js";
import { getIndexSourcedSidebarItems } from "./utils.js";

afterEach(unlockAll);

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

  it.skipIf(isRunningAsRoot)("throws when an index can't be read", () => {
    const rootDirPath = makeFileTree({
      "guides/index.md": "---\ntitle: Guides\n---\n",
    });
    const indexFilePath = join(rootDirPath, "guides/index.md");
    lockPath(indexFilePath);

    expect(() =>
      getIndexSourcedSidebarItems(join(rootDirPath, "guides")),
    ).toThrow(/EACCES/);
  });

  it.skipIf(isRunningAsRoot)(
    "throws the real error when an index can't be checked",
    () => {
      const rootDirPath = makeFileTree({
        "guides/index.md": "---\ntitle: Guides\n---\n",
      });
      lockPath(join(rootDirPath, "guides"));

      expect(() =>
        getIndexSourcedSidebarItems(join(rootDirPath, "guides")),
      ).toThrow(/EACCES/);
    },
  );

  it.skipIf(isRunningAsRoot)(
    "throws when a linked doc can't be checked",
    () => {
      const rootDirPath = makeFileTree({
        "guides/index.md": "---\ntitle: Guides\n---\n\n[Page](./locked/page)\n",
        "guides/locked/page.md": "---\ntitle: Page\n---\n",
      });
      lockPath(join(rootDirPath, "guides/locked"));

      expect(() =>
        getIndexSourcedSidebarItems(join(rootDirPath, "guides")),
      ).toThrow(/EACCES/);
    },
  );
});
