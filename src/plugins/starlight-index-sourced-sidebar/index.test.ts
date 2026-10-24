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

  it("flattens groups at maxDepthNesting into their parent", async () => {
    const { setup } = runSetup(NESTED_DOCS_FILES, {
      directories: ["guides"],
      maxDepthNesting: 1,
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
