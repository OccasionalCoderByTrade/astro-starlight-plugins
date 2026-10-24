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
