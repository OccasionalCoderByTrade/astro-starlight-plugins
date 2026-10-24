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

  it("gives each entry its source doc's page path as the slug", async () => {
    const { setup } = runSetup(
      {
        "Getting Started/index.md":
          "---\ntitle: Getting Started\n---\n\n[My Page](<./My Page.md>)\n",
        "Getting Started/My Page.md": "---\ntitle: My Page\n---\n",
      },
      { directories: ["Getting Started"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Getting Started",
        collapsed: true,
        items: [
          { label: "Getting Started", slug: "getting-started" },
          { label: "My Page", slug: "getting-started/my-page" },
        ],
      },
    ]);
  });

  it("uses a source doc's slug frontmatter as its entry's slug", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\nslug: start\n---\n\n[Setup](./setup.md)\n",
        "guides/setup.md": "---\ntitle: Setup\nslug: install/setup\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "start" },
          { label: "Setup", slug: "install/setup" },
        ],
      },
    ]);
  });

  it("labels index entries and page entries from sidebar.label, then title", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: All Guides\nsidebar:\n  label: Start Here\n---\n\n- [Setup](./setup)\n- [Advanced](./advanced/index)\n",
        "guides/setup.md":
          "---\ntitle: Setup\nsidebar:\n  label: Install\n---\n",
        "guides/advanced/index.md":
          "---\ntitle: Advanced\nsidebar:\n  label: Deep Dive\n---\n\n[Tips](./tips.md)\n",
        "guides/advanced/tips.md": "# no title\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Start Here", slug: "guides" },
          { label: "Install", slug: "guides/setup" },
          {
            label: "Advanced",
            collapsed: true,
            items: [
              { label: "Deep Dive", slug: "guides/advanced" },
              { label: "Tips", slug: "guides/advanced/tips" },
            ],
          },
        ],
      },
    ]);
  });

  const BADGED_DOCS_FILES = {
    "guides/index.md":
      "---\ntitle: Guides\nsidebar:\n  badge: Start\n---\n\n- [Setup](./setup)\n- [Faq](./faq)\n- [Advanced](./advanced/index)\n",
    "guides/setup.md":
      "---\ntitle: Setup\nsidebar:\n  badge:\n    text: New\n    variant: tip\n---\n",
    "guides/faq.md": "---\ntitle: Faq\nsidebar:\n  badge: Old\n---\n",
    "guides/advanced/index.md": "---\ntitle: Advanced\n---\n",
  };

  it("shows sidebar.badge on page entries and on index entries without an indexMarker", async () => {
    const { setup } = runSetup(BADGED_DOCS_FILES, { directories: ["guides"] });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          {
            label: "Guides",
            slug: "guides",
            badge: { text: "Start", variant: "default" },
          },
          {
            label: "Setup",
            slug: "guides/setup",
            badge: { text: "New", variant: "tip" },
          },
          {
            label: "Faq",
            slug: "guides/faq",
            badge: { text: "Old", variant: "default" },
          },
          {
            label: "Advanced",
            collapsed: true,
            items: [{ label: "Advanced", slug: "guides/advanced" }],
          },
        ],
      },
    ]);
  });

  it("shows the indexMarker instead of sidebar.badge on index entries", async () => {
    const indexMarker = { text: "Index", variant: "note" } as const;
    const { setup } = runSetup(BADGED_DOCS_FILES, {
      directories: ["guides"],
      indexMarker,
    });

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides", badge: indexMarker },
          {
            label: "Setup",
            slug: "guides/setup",
            badge: { text: "New", variant: "tip" },
          },
          {
            label: "Faq",
            slug: "guides/faq",
            badge: { text: "Old", variant: "default" },
          },
          {
            label: "Advanced",
            collapsed: true,
            items: [
              { label: "Advanced", slug: "guides/advanced", badge: indexMarker },
            ],
          },
        ],
      },
    ]);
  });

  it("skips links to docs assets without a warning", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Setup](./setup) [Diagram](./diagram.png) [Manual](./manual.pdf)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
        "guides/diagram.png": "png",
        "guides/manual.pdf": "pdf",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("warns once and adds nothing for a link to a missing file", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Setup](./setup) [Gone](./gone)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
        ],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(PLUGIN_PREFIX);
    expect(warnings[0]).toContain("guides/index.md");
    expect(warnings[0]).toContain("./gone");
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

const MARKDOC_INTEGRATION = { name: "@astrojs/markdoc", hooks: {} };

describe("starlightIndexSourcedSidebar source docs", () => {
  it("counts .mdoc sidebar indexes and pages when Markdoc is installed", async () => {
    const { setup } = runSetup(
      {
        "guides/index.mdoc":
          "---\ntitle: Guides\n---\n\n- [Setup](./setup)\n- [Tips](./tips.mdoc)\n",
        "guides/setup.mdoc": "---\ntitle: Setup\n---\n",
        "guides/tips.mdoc": "---\ntitle: Tips\n---\n",
      },
      { directories: ["guides"] },
      { integrations: [MARKDOC_INTEGRATION] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "guides/setup" },
          { label: "Tips", slug: "guides/tips" },
        ],
      },
    ]);
  });

  it("treats .mdoc files as docs assets without Markdoc", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n- [Setup](./setup)\n- [Tips](./tips.mdoc)\n",
        "guides/setup.mdoc": "---\ntitle: Setup\n---\n",
        "guides/tips.mdoc": "---\ntitle: Tips\n---\n",
      },
      { directories: ["guides"] },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [{ label: "Guides", slug: "guides" }],
      },
    ]);
  });

  it("leaves out a link to a _-prefixed file with a warning", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Partial](./_partial.md)\n",
        "guides/_partial.md": "---\ntitle: Partial\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [{ label: "Guides", slug: "guides" }],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("guides/index.md");
    expect(warnings[0]).toContain("./_partial.md");
  });

  it("counts a page in a _-prefixed folder", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Shared](./_partials/shared)\n",
        "guides/_partials/shared.md": "---\ntitle: Shared\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Shared", slug: "guides/_partials/shared" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("starlightIndexSourcedSidebar hidden from sidebar", () => {
  const HIDDEN_DOCS_FILES = {
    "guides/index.md":
      "---\ntitle: Guides\n---\n\n- [Draft](./draft)\n- [Hidden](./hidden)\n- [Unsearchable](./unsearchable)\n- [Section](./section/index)\n",
    "guides/draft.md": "---\ntitle: Draft\ndraft: true\n---\n",
    "guides/hidden.md": "---\ntitle: Hidden\nsidebar:\n  hidden: true\n---\n",
    "guides/unsearchable.md": "---\ntitle: Unsearchable\npagefind: false\n---\n",
    "guides/section/index.md":
      "---\ntitle: Section\ndraft: true\n---\n\n[Inside](./inside)\n",
    "guides/section/inside.md": "---\ntitle: Inside\n---\n",
  };

  const VISIBLE_SIDEBAR = [
    {
      label: "Guides",
      collapsed: true,
      items: [
        { label: "Guides", slug: "guides" },
        { label: "Unsearchable", slug: "guides/unsearchable" },
      ],
    },
  ];

  it.each(["dev", "build"] as const)(
    "hides draft and sidebar.hidden entries and hidden sidebar index groups in %s, but not pagefind: false",
    async (command) => {
      const { setup } = runSetup(
        HIDDEN_DOCS_FILES,
        { directories: ["guides"] },
        { command },
      );

      expect((await setup()).sidebar).toEqual(VISIBLE_SIDEBAR);
    },
  );

  it("drops the root group of a hidden root sidebar index without an error", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\ndraft: true\n---\n\n[Setup](./setup)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
        "reference/index.md": "---\ntitle: Reference\n---\n",
      },
      { directories: ["guides", "reference"] },
    );

    const { sidebar, warnings, errors } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Reference",
        collapsed: true,
        items: [{ label: "Reference", slug: "reference" }],
      },
    ]);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("starlightIndexSourcedSidebar sub-index links", () => {
  const ADVANCED_SIDEBAR = [
    {
      label: "Guides",
      collapsed: true,
      items: [
        { label: "Guides", slug: "guides" },
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
  ];

  it.each([
    ["index.mdx", []],
    ["index.mdoc", [MARKDOC_INTEGRATION]],
  ])(
    "expands a sub-index link to an %s into a nested group",
    async (subIndexFileName, integrations) => {
      const { setup } = runSetup(
        {
          "guides/index.md":
            "---\ntitle: Guides\n---\n\n[Advanced](./advanced/index)\n",
          [`guides/advanced/${subIndexFileName}`]:
            "---\ntitle: Advanced\n---\n\n[Tips](./tips.md)\n",
          "guides/advanced/tips.md": "---\ntitle: Tips\n---\n",
        },
        { directories: ["guides"] },
        { integrations },
      );

      expect((await setup()).sidebar).toEqual(ADVANCED_SIDEBAR);
    },
  );

  it("gives a leaf index one entry with the index marker, leaving out its links", async () => {
    const indexMarker = { text: "Index", variant: "note" } as const;
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Showcase](./showcase/index)\n",
        "guides/showcase/index.md":
          "---\ntitle: Showcase\nindexSourcedSidebar:\n  leaf: true\n---\n\n[Demo](./demo)\n",
        "guides/showcase/demo.md": "---\ntitle: Demo\n---\n",
      },
      { directories: ["guides"], indexMarker },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides", badge: indexMarker },
          { label: "Showcase", slug: "guides/showcase", badge: indexMarker },
        ],
      },
    ]);
  });

  it("ignores the leaf key on a root sidebar index", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\nindexSourcedSidebar:\n  leaf: true\n---\n\n[Setup](./setup)\n",
        "guides/setup.md": "---\ntitle: Setup\n---\n",
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

  it("treats a folder link as a sub-index link to the folder's sidebar index", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Advanced](./advanced/)\n",
        "guides/advanced/index.md":
          "---\ntitle: Advanced\n---\n\n[Tips](./tips.md)\n",
        "guides/advanced/tips.md": "---\ntitle: Tips\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual(ADVANCED_SIDEBAR);
    expect(warnings).toEqual([]);
  });

  it("warns and adds nothing for a folder link to a folder with no sidebar index, even with a sibling page", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Advanced](./advanced/)\n",
        "guides/advanced.md": "---\ntitle: Advanced\n---\n",
        "guides/advanced/tips.md": "---\ntitle: Tips\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [{ label: "Guides", slug: "guides" }],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("guides/index.md");
    expect(warnings[0]).toContain("./advanced/");
  });

  it("warns and doesn't recurse on a sub-index link back to an ancestor sidebar index", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Advanced](./advanced/index)\n",
        "guides/advanced/index.md":
          "---\ntitle: Advanced\n---\n\n[Tips](./tips.md) [Back](../index)\n",
        "guides/advanced/tips.md": "---\ntitle: Tips\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual(ADVANCED_SIDEBAR);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("guides/advanced/index.md");
    expect(warnings[0]).toContain("../index");
  });

  it("puts a directory linked from two sidebar indexes under both", async () => {
    const SHARED_GROUP = {
      label: "Shared",
      collapsed: true,
      items: [
        { label: "Shared", slug: "shared" },
        { label: "Faq", slug: "shared/faq" },
      ],
    };
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\n---\n\n[Shared](../shared/)\n",
        "reference/index.md":
          "---\ntitle: Reference\n---\n\n[Shared](../shared/index)\n",
        "shared/index.md": "---\ntitle: Shared\n---\n\n[FAQ](./faq)\n",
        "shared/faq.md": "---\ntitle: Faq\n---\n",
      },
      { directories: ["guides", "reference"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [{ label: "Guides", slug: "guides" }, SHARED_GROUP],
      },
      {
        label: "Reference",
        collapsed: true,
        items: [{ label: "Reference", slug: "reference" }, SHARED_GROUP],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("starlightIndexSourcedSidebar link forms", () => {
  /** A guides sidebar index whose only link, `setupHref`, should reach guides/setup.md. */
  function setupLinkDocsFiles(setupHref: string) {
    return {
      "guides/index.md": `---\ntitle: Guides\n---\n\n[Setup](${setupHref})\n`,
      "guides/setup.md": "---\ntitle: Setup\n---\n",
    };
  }
  const SETUP_LINK_SIDEBAR = [
    {
      label: "Guides",
      collapsed: true,
      items: [
        { label: "Guides", slug: "guides" },
        { label: "Setup", slug: "guides/setup" },
      ],
    },
  ];

  it("resolves a root-absolute link against the docs root", async () => {
    const { setup } = runSetup(setupLinkDocsFiles("/guides/setup"), {
      directories: ["guides"],
    });

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual(SETUP_LINK_SIDEBAR);
    expect(warnings).toEqual([]);
  });

  it.each(["/docs", "/docs/"])(
    "strips base %s from a root-absolute link that starts with it",
    async (base) => {
      const { setup } = runSetup(
        setupLinkDocsFiles("/docs/guides/setup"),
        { directories: ["guides"] },
        { base },
      );

      const { sidebar, warnings } = await setup();

      expect(sidebar).toEqual(SETUP_LINK_SIDEBAR);
      expect(warnings).toEqual([]);
    },
  );

  it("keeps a root-absolute link that only shares a prefix with base", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[Setup](/docsy/setup)\n",
        "docsy/setup.md": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"] },
      { base: "/docs" },
    );

    expect((await setup()).sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Setup", slug: "docsy/setup" },
        ],
      },
    ]);
  });

  it("percent-decodes a link", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md":
          "---\ntitle: Guides\n---\n\n[My Page](./my%20page)\n",
        "guides/my page.md": "---\ntitle: My Page\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "My Page", slug: "guides/my-page" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("skips links with any URL scheme, and protocol-relative links, without a warning", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": [
          "---\ntitle: Guides\n---\n",
          "- [Site](https://example.com/setup)",
          "- [Mail](mailto:me@example.com)",
          "- [Call](tel:+123456)",
          "- [Files](ftp://example.com/setup)",
          "- [Custom](x-custom:setup)",
          "- [Cdn](//example.com/setup)",
          "",
        ].join("\n"),
        "guides/setup.md": "---\ntitle: Setup\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [{ label: "Guides", slug: "guides" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("counts reference-style links in the order the references appear", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": [
          "---\ntitle: Guides\n---\n",
          "- [Tips][tips]",
          "- [Setup](./setup)",
          "- [Faq]",
          "- [Advanced][]",
          "",
          "[advanced]: ./advanced",
          "[faq]: ./faq",
          "[tips]: ./tips",
          "[unused]: ./unused",
          "",
        ].join("\n"),
        "guides/setup.md": "---\ntitle: Setup\n---\n",
        "guides/tips.md": "---\ntitle: Tips\n---\n",
        "guides/faq.md": "---\ntitle: Faq\n---\n",
        "guides/advanced.md": "---\ntitle: Advanced\n---\n",
        "guides/unused.md": "---\ntitle: Unused\n---\n",
      },
      { directories: ["guides"] },
    );

    const { sidebar, warnings } = await setup();

    expect(sidebar).toEqual([
      {
        label: "Guides",
        collapsed: true,
        items: [
          { label: "Guides", slug: "guides" },
          { label: "Tips", slug: "guides/tips" },
          { label: "Setup", slug: "guides/setup" },
          { label: "Faq", slug: "guides/faq" },
          { label: "Advanced", slug: "guides/advanced" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});
