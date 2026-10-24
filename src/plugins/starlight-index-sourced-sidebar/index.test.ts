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
