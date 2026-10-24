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

  it("labels index entries from sidebar.label, then title, when dirnameDeterminesLabels is false", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\nsidebar:\n  label: Start Here\n---\n",
        "guides/setup/index.md": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"], dirnameDeterminesLabels: false },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Start Here", slug: "guides" },
          {
            label: "Setup",
            items: [{ label: "Setup", slug: "guides/setup" }],
          },
        ],
      },
    ]);
  });

  it("keeps directory-name labels over sidebar.label when dirnameDeterminesLabels is true", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\nsidebar:\n  label: Start Here\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      { label: "Guides", items: [{ label: "Overview", slug: "guides" }] },
    ]);
  });

  it("shows sidebar.badge on its entries", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\nsidebar:\n  badge: New\n---\n",
        "guides/setup/index.md":
          "---\ntitle: Setup\nsidebar:\n  badge:\n    text: Beta\n    variant: caution\n---\n",
        "guides/setup/linux-101/index.md":
          "---\ntitle: Linux\nsidebar:\n  badge: Deep\n---\n",
      },
      { directories: ["guides"], maxGroupLevels: 2 },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          {
            label: "Overview",
            slug: "guides",
            badge: { text: "New", variant: "default" },
          },
          {
            label: "Setup",
            items: [
              {
                label: "setup",
                slug: "guides/setup",
                badge: { text: "Beta", variant: "caution" },
              },
              {
                label: "LINUX 101",
                slug: "guides/setup/linux-101",
                badge: { text: "Deep", variant: "default" },
              },
            ],
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

  it("gives index entries of a nested directory their page path as the slug", async () => {
    const { setup } = runSetup(
      {
        "guides/Getting Started/index.md": "---\ntitle: Start\n---\n",
        "guides/Getting Started/First Steps/index.md":
          "---\ntitle: First\n---\n",
      },
      { directories: ["guides/Getting Started"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Getting Started",
        items: [
          { label: "Overview", slug: "guides/getting-started" },
          {
            label: "First Steps",
            items: [
              {
                label: "Overview",
                slug: "guides/getting-started/first-steps",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("uses an index's slug frontmatter as its entry's slug", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\nslug: start\n---\n",
        "guides/setup/index.md": "---\ntitle: Setup\nslug: install\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Overview", slug: "start" },
          { label: "Setup", items: [{ label: "Overview", slug: "install" }] },
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

const MARKDOC_INTEGRATION = { name: "@astrojs/markdoc", hooks: {} };

describe("starlightIndexOnlySidebar source docs", () => {
  const MDOC_DOCS_FILES = {
    "guides/index.mdoc": "---\ntitle: Guides\n---\n",
    "guides/setup/index.mdoc": "---\ntitle: Setup\n---\n",
  };

  it("counts .mdoc sidebar indexes when Markdoc is installed", async () => {
    const { setup } = runSetup(
      MDOC_DOCS_FILES,
      { directories: ["guides"] },
      { integrations: [MARKDOC_INTEGRATION] },
    );

    expect((await setup()).sidebar).toEqual(NESTED_SIDEBAR);
  });

  it("ignores .mdoc sidebar indexes without Markdoc", async () => {
    const { setup } = runSetup(MDOC_DOCS_FILES, { directories: ["guides"] });

    // The root's only index is an index.mdoc, so without Markdoc it has no sidebar index
    await expect(setup()).rejects.toThrow(
      `${PLUGIN_PREFIX} No sidebar index (index.md or index.mdx) for directories entry "guides"`,
    );
  });

  it("counts a _-prefixed folder", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\n---\n",
        "guides/_partials/index.md": "---\ntitle: Partials\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        items: [
          { label: "Overview", slug: "guides" },
          {
            label: "_partials",
            items: [{ label: "Overview", slug: "guides/_partials" }],
          },
        ],
      },
    ]);
  });
});

describe("starlightIndexOnlySidebar hidden from sidebar", () => {
  it.each(["dev", "build"] as const)(
    "hides draft and sidebar.hidden indexes in %s, but not pagefind: false",
    async (command) => {
      const { setup } = runSetup(
        {
          "guides/index.md": "---\ntitle: Guides\n---\n",
          "guides/drafts/index.md": "---\ndraft: true\n---\n",
          "guides/hidden/index.md": "---\nsidebar:\n  hidden: true\n---\n",
          "guides/hidden/inside/index.md": "---\ntitle: Inside\n---\n",
          "guides/unsearchable/index.md": "---\npagefind: false\n---\n",
        },
        { directories: ["guides"] },
        { command },
      );

      expect((await setup()).sidebar).toEqual([
        {
          label: "Guides",
          items: [
            { label: "Overview", slug: "guides" },
            {
              label: "Unsearchable",
              items: [{ label: "Overview", slug: "guides/unsearchable" }],
            },
          ],
        },
      ]);
    },
  );

  it("drops the root group of a hidden root sidebar index without an error", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\ndraft: true\n---\n",
        "guides/setup/index.md": "---\ntitle: Setup\n---\n",
        "reference/index.md": "---\ntitle: Reference\n---\n",
      },
      { directories: ["guides", "reference"] },
    );

    const { sidebar, errors } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Reference",
        items: [{ label: "Overview", slug: "reference" }],
      },
    ]);
    expect(errors).toEqual([]);
  });
});
