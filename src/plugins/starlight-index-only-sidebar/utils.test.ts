import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRunningAsRoot,
  lockPath,
  makeFileTree,
  unlockAll,
} from "../tests/file-tree.js";
import { getIndexMdSidebarItems } from "./utils.js";

afterEach(unlockAll);

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

  it("includes a directory whose index is an index.mdx", () => {
    const rootDirPath = makeFileTree({
      "guides/index.mdx": "---\ntitle: Guides\n---\n",
      "guides/setup/index.mdx": "---\ntitle: Setup\n---\n",
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

  it.skipIf(isRunningAsRoot)(
    "throws when a directory under it can't be read",
    () => {
      const rootDirPath = makeFileTree({
        "guides/index.md": "---\ntitle: Guides\n---\n",
        "guides/locked/index.md": "---\ntitle: Locked\n---\n",
      });
      lockPath(join(rootDirPath, "guides/locked"));

      expect(() => getIndexMdSidebarItems(join(rootDirPath, "guides"))).toThrow(
        /EACCES/,
      );
    },
  );

  it.skipIf(isRunningAsRoot)(
    "throws the real error when the directory can't be checked",
    () => {
      const rootDirPath = makeFileTree({ "locked/guides/index.md": "" });
      lockPath(join(rootDirPath, "locked"));

      expect(() =>
        getIndexMdSidebarItems(join(rootDirPath, "locked/guides")),
      ).toThrow(/EACCES/);
    },
  );
});
