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

  it("flattens directories past maxDepthNesting into their parent", async () => {
    const { setup } = runSetup(
      {
        "guides/index.md": "---\ntitle: Guides\n---\n",
        "guides/setup/index.md": "---\ntitle: Setup\n---\n",
        "guides/setup/linux-101/index.md": "---\ntitle: Linux\n---\n",
      },
      { directories: ["guides"], maxDepthNesting: 1 },
    );

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

  it("throws when a directory doesn't exist", async () => {
    const { setup, docsDirPath } = runSetup(
      { "reference/index.md": "---\ntitle: Reference\n---\n" },
      { directories: ["guides"] },
    );

    await expect(setup()).rejects.toThrow(join(docsDirPath, "guides"));
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

    expect((await setup()).sidebar).toEqual([]);
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
