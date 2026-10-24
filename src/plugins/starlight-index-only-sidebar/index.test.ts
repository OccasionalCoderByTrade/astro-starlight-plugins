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
import { starlightIndexOnlySidebar } from "./index.js";

afterEach(unlockAll);

type TPluginOptions = Parameters<typeof starlightIndexOnlySidebar>[0];

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
      runStarlightConfigSetup(starlightIndexOnlySidebar(pluginOptions), {
        rootDirPath,
        ...setupOptions,
      }),
  };
}

const NESTED_DOCS_FILES = {
  "guides/index.md": "---\ntitle: Guides\n---\n",
  "guides/setup/index.md": "---\ntitle: Setup\n---\n",
  "guides/drafts/index.md": "---\ndraft: true\n---\n",
};

const NESTED_SIDEBAR = [
  {
    label: "Guides",
    items: [
      { label: "Overview", slug: "guides" },
      {
        label: "Setup",
        items: [{ label: "Overview", slug: "guides/setup" }],
      },
    ],
  },
];

/** guides -> setup -> linux-101, each with an index. */
const DEEP_DOCS_FILES = {
  "guides/index.md": "---\ntitle: Guides\n---\n",
  "guides/setup/index.md": "---\ntitle: Setup\n---\n",
  "guides/setup/linux-101/index.md": "---\ntitle: Linux\n---\n",
};

const PLUGIN_PREFIX = "[starlight-index-only-sidebar]";

describe("starlightIndexOnlySidebar", () => {
  it("builds a group per subdirectory that has an index", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, { directories: ["guides"] });

    expect((await setup()).sidebar).toEqual(NESTED_SIDEBAR);
  });

  it("reads the docs root from Astro's srcDir", async () => {
    const { setup } = runSetup(
      NESTED_DOCS_FILES,
      { directories: ["guides"] },
      { srcDir: "site-src/" },
    );

    expect((await setup()).sidebar).toEqual(NESTED_SIDEBAR);
  });

  it("includes a directory whose index is an index.mdx", async () => {
    const { setup } = runSetup(
      {
        "guides/index.mdx": "---\ntitle: Guides\n---\n",
        "guides/setup/index.mdx": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual(NESTED_SIDEBAR);
  });

  it("labels index entries from their title when dirnameDeterminesLabels is false", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, {
      directories: ["guides"],
      dirnameDeterminesLabels: false,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Guides", slug: "guides" },
          {
            label: "Setup",
            items: [{ label: "Setup", slug: "guides/setup" }],
          },
        ],
      },
    ]);
  });

  it("flattens every directory under the root group when maxGroupLevels is 1", async () => {
    const { setup } = runSetup(DEEP_DOCS_FILES, {
      directories: ["guides"],
      maxGroupLevels: 1,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Overview", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
          { label: "LINUX 101", slug: "guides/setup/linux-101" },
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
        items: [
          { label: "Overview", slug: "guides" },
          {
            label: "Setup",
            items: [
              { label: "setup", slug: "guides/setup" },
              { label: "LINUX 101", slug: "guides/setup/linux-101" },
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
        items: [
          { label: "Overview", slug: "guides" },
          {
            label: "Setup",
            items: [
              { label: "Overview", slug: "guides/setup" },
              {
                label: "LINUX 101",
                items: [{ label: "Overview", slug: "guides/setup/linux-101" }],
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
    const { setup, docsDirPath } = runSetup(
      { "reference/index.md": "---\ntitle: Reference\n---\n" },
      { directories: ["guides"] },
    );

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} Directory not found for directories entry "guides": ${join(docsDirPath, "guides")}`,
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
      { "guides/setup/index.md": "---\ntitle: Setup\n---\n" },
      { directories: ["guides"] },
    );

    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} No sidebar index (index.md or index.mdx) for directories entry "guides": ${join(docsDirPath, "guides")}`,
    );
  });

  it.skipIf(isRunningAsRoot)(
    "throws when a directory under it can't be read",
    async () => {
      const { setup, docsDirPath } = runSetup(
        {
          "guides/index.md": "---\ntitle: Guides\n---\n",
          "guides/locked/index.md": "---\ntitle: Locked\n---\n",
        },
        { directories: ["guides"] },
      );
      lockPath(join(docsDirPath, "guides/locked"));

      await expect(setup()).rejects.toThrow(/EACCES/);
    },
  );

  it.skipIf(isRunningAsRoot)(
    "throws the real error when the directory can't be checked",
    async () => {
      const { setup, docsDirPath } = runSetup(
        { "locked/guides/index.md": "" },
        { directories: ["locked/guides"] },
      );
      lockPath(join(docsDirPath, "locked"));

      await expect(setup()).rejects.toThrow(/EACCES/);
    },
  );
});
