import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRunningAsRoot,
  lockPath,
  makeFileTree,
  unlockAll,
} from "../tests/file-tree.js";
import {
  runStarlightConfigSetup,
  type TStarlightConfigSetupOptions,
} from "../tests/starlight-config-setup.js";
import { starlightIndexSourcedSidebar } from "./index.js";

afterEach(unlockAll);

type TPluginOptions = Parameters<typeof starlightIndexSourcedSidebar>[0];

/** Makes `docsFiles` under `<srcDir>content/docs/` and runs the plugin's `config:setup` hook. */
function runSetup(
  docsFiles: Record<string, string>,
  pluginOptions: TPluginOptions,
  setupOptions: Omit<TStarlightConfigSetupOptions, "rootDirPath"> = {},
) {
  const srcDir = setupOptions.srcDir ?? "src/";
  const rootDirPath = makeFileTree(
    Object.fromEntries(
      Object.entries(docsFiles).map(([docsRelativeFilePath, contents]) => [
        `${srcDir}content/docs/${docsRelativeFilePath}`,
        contents,
      ]),
    ),
  );
  return {
    rootDirPath,
    docsDirPath: join(rootDirPath, srcDir, "content/docs"),
    setup: () =>
      runStarlightConfigSetup(starlightIndexSourcedSidebar(pluginOptions), {
        rootDirPath,
        ...setupOptions,
      }),
  };
}

const NESTED_DOCS_FILES = {
  "guides/index.md":
    "---\ntitle: All Guides\n---\n\n- [Setup](./setup)\n- [Advanced](./advanced/index)\n",
  "guides/setup.md": "---\ntitle: Setup\n---\n",
  "guides/advanced/index.md":
    "---\ntitle: Advanced\n---\n\n[Tips](./tips.md)\n",
  "guides/advanced/tips.md": "# no title\n",
};

/** guides -> a -> b -> c, each a sub-index of the one above. */
const DEEP_DOCS_FILES = {
  "guides/index.md": "---\ntitle: Guides\n---\n\n[A](./a/index)\n",
  "guides/a/index.md": "---\ntitle: A\n---\n\n[B](./b/index)\n",
  "guides/a/b/index.md": "---\ntitle: B\n---\n\n[C](./c/index)\n",
  "guides/a/b/c/index.md": "---\ntitle: C\n---\n",
};

const PLUGIN_PREFIX = "[starlight-index-sourced-sidebar]";

describe("starlightIndexSourcedSidebar", () => {
  it("builds nested groups from the links in each sidebar index", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, { directories: ["guides"] });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "All Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
          {
            label: "Advanced",
            collapsed: true,
            items: [
              { label: "Advanced", slug: "guides/advanced" },
              { label: "Tips", slug: "guides/advanced/tips" },
            ],
          },
        ],
      },
    ]);
  });

  it("reads the docs root from Astro's srcDir", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\n---\n\n[Setup](./setup)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"] },
      { srcDir: "site-src/" },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
        ],
      },
    ]);
  });

  it("flattens every group under the root group when maxGroupLevels is 1", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, {
      directories: ["guides"],
      maxGroupLevels: 1,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "All Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
          { label: "Advanced", slug: "guides/advanced" },
          { label: "Tips", slug: "guides/advanced/tips" },
        ],
      },
    ]);
  });

  it("keeps one level of nested groups when maxGroupLevels is 2", async () => {
    const { setup } = runSetup(DEEP_DOCS_FILES, {
      directories: ["guides"],
      maxGroupLevels: 2,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          {
            label: "A",
            collapsed: true,
            items: [
              { label: "A", slug: "guides/a" },
              { label: "B", slug: "guides/a/b" },
              { label: "C", slug: "guides/a/b/c" },
            ],
          },
        ],
      },
    ]);
  });

  it("nests without limit when maxGroupLevels is unset", async () => {
    const { setup } = runSetup(DEEP_DOCS_FILES, { directories: ["guides"] });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          {
            label: "A",
            collapsed: true,
            items: [
              { label: "A", slug: "guides/a" },
              {
                label: "B",
                collapsed: true,
                items: [
                  { label: "B", slug: "guides/a/b" },
                  {
                    label: "C",
                    collapsed: true,
                    items: [{ label: "C", slug: "guides/a/b/c" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it.each([0, 1.5, -1])(
    "throws at startup when maxGroupLevels is %s",
    async (maxGroupLevels) => {
      const { setup } = runSetup(NESTED_DOCS_FILES, {
        directories: ["guides"],
        maxGroupLevels,
      });

      await expect(setup()).rejects.toThrow(
        `${PLUGIN_PREFIX} maxGroupLevels must be an integer of at least 1, got ${maxGroupLevels}`,
      );
    },
  );

  it("throws when a directories entry is outside the docs root", async () => {
    const { setup, docsDirPath } = runSetup(NESTED_DOCS_FILES, {
      directories: ["../outside"],
    });

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} directories entry "../outside" is outside the docs root ${docsDirPath}`,
    );
  });

  it("throws directory not found when a directories entry doesn't exist", async () => {
    const { setup, docsDirPath } = runSetup(NESTED_DOCS_FILES, {
      directories: ["gone"],
    });

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} Directory not found for directories entry "gone": ${join(docsDirPath, "gone")}`,
    );
  });

  it("throws when the same directory is listed twice", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, {
      directories: ["guides", "./guides/"],
    });

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} directories entry "./guides/" is the same directory as "guides"`,
    );
  });

  it("throws when a root directory has no sidebar index", async () => {
    const { setup, docsDirPath } = runSetup(
      { "guides/setup.md": "---\ntitle: Setup\n---\n" },
      { directories: ["guides"] },
    );

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} No sidebar index (index.md or index.mdx) for directories entry "guides": ${join(docsDirPath, "guides")}`,
    );
  });

  it("badges index entries with indexMarker and honours collapsed", async () => {
    const indexMarker = { text: "Index", variant: "note" } as const;
    const { setup } = runSetup(NESTED_DOCS_FILES, {
      directories: ["guides"],
      indexMarker,
      collapsed: false,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: false,
        items: [
          { label: "All Guides", slug: "guides", badge: indexMarker },
          { label: "Setup", slug: "guides/setup" },
          {
            label: "Advanced",
            collapsed: false,
            items: [
              { label: "Advanced", slug: "guides/advanced", badge: indexMarker },
              { label: "Tips", slug: "guides/advanced/tips" },
            ],
          },
        ],
      },
    ]);
  });

  it("skips links in a sidebar index that don't resolve to a source doc", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Setup](./setup) [Diagram](./diagram.png) [Gone](./gone)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
        "guides/diagram.png": "png",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
        ],
      },
    ]);
  });

  it.skipIf(isRunningAsRoot)(
    "throws when a sidebar index can't be read",
    async () => {
      const { setup, docsDirPath } = runSetup(
        { "guides/index.md": "---\ntitle: Guides\n---\n" },
        { directories: ["guides"] },
      );
      lockPath(join(docsDirPath, "guides/index.md"));

      await expect(setup()).rejects.toThrow(/EACCES/);
    },
  );

  it.skipIf(isRunningAsRoot)(
    "throws the real error when a sidebar index can't be checked",
    async () => {
      const { setup, docsDirPath } = runSetup(
        { "guides/index.md": "---\ntitle: Guides\n---\n" },
        { directories: ["guides"] },
      );
      lockPath(join(docsDirPath, "guides"));

      await expect(setup()).rejects.toThrow(/EACCES/);
    },
  );

  it.skipIf(isRunningAsRoot)(
    "throws when a linked source doc can't be checked",
    async () => {
      const { setup, docsDirPath } = runSetup(
        {
          "guides/index.md":
            "---\ntitle: Guides\n---\n\n[Page](./locked/page)\n",
          "guides/locked/page.md": "---\ntitle: Page\n---\n",
        },
        { directories: ["guides"] },
      );
      lockPath(join(docsDirPath, "guides/locked"));

      await expect(setup()).rejects.toThrow(/EACCES/);
    },
  );
});
