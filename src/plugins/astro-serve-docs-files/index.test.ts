import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import {
  astroServeDocsFiles,
  type AstroServeDocsFilesOptions,
} from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

type TInjectedRoute = {
  pattern: string;
  entrypoint: string | URL;
  prerender?: boolean;
};
type TVitePlugin = {
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
};

/**
 * Runs `astro:config:setup` for a project holding `files`, with a fake Astro config whose
 * `srcDir` and `publicDir` default to Astro's. Returns what the hook injected.
 */
async function runConfigSetup(
  files: Record<string, string>,
  options: AstroServeDocsFilesOptions = {},
  dirs: { srcDir?: string; publicDir?: string } = {},
) {
  const rootDirPath = makeFileTree(files);
  const rootUrl = pathToFileURL(rootDirPath + "/");
  const integration = astroServeDocsFiles(options);
  const injectedRoutes: TInjectedRoute[] = [];
  const vitePlugins: TVitePlugin[] = [];
  const configSetupHook = integration.hooks["astro:config:setup"] as (
    params: unknown,
  ) => Promise<void> | void;
  await configSetupHook({
    command: "dev",
    config: {
      root: rootUrl,
      srcDir: new URL(dirs.srcDir ?? "src/", rootUrl),
      publicDir: new URL(dirs.publicDir ?? "public/", rootUrl),
    },
    injectRoute: (route: TInjectedRoute) => injectedRoutes.push(route),
    injectScript: () => {},
    updateConfig: (configUpdate: { vite?: { plugins?: TVitePlugin[] } }) => {
      vitePlugins.push(...(configUpdate.vite?.plugins ?? []));
    },
  });
  return { rootDirPath, integration, injectedRoutes, vitePlugins };
}

/** The settings the route module imports, as the integration's Vite plugin serves them. */
function loadRouteSettings(vitePlugins: TVitePlugin[]) {
  for (const vitePlugin of vitePlugins) {
    const resolvedId = vitePlugin.resolveId(
      "virtual:astro-serve-docs-files/settings",
    );
    if (!resolvedId) continue;
    const moduleSource = vitePlugin.load(resolvedId) ?? "";
    return JSON.parse(moduleSource.replace(/^export default |;$/g, ""));
  }
  throw new Error("no Vite plugin serves the route settings");
}

describe("astroServeDocsFiles config setup", () => {
  it("injects one prerendered /[...path] route whose entrypoint exists", async () => {
    const { injectedRoutes } = await runConfigSetup({});

    expect(injectedRoutes).toHaveLength(1);
    expect(injectedRoutes[0]).toMatchObject({
      pattern: "/[...path]",
      prerender: true,
    });
    const entrypointUrl = new URL(String(injectedRoutes[0].entrypoint));
    expect(existsSync(fileURLToPath(entrypointUrl))).toBe(true);
  });

  it("reads the docs dir from Astro's srcDir and passes it to the route", async () => {
    const { rootDirPath, vitePlugins } = await runConfigSetup(
      {},
      { ignorePatterns: ["scratch"] },
      { srcDir: "site-src/" },
    );

    expect(loadRouteSettings(vitePlugins)).toEqual({
      docsDirPath: join(rootDirPath, "site-src/content/docs"),
      ignorePatterns: ["scratch"],
    });
  });

  it("rejects ignorePatterns that hide raw docs while the page-action bar is on", async () => {
    await expect(
      runConfigSetup({}, { enableAskAiOption: true, ignorePatterns: ["**/*.md"] }),
    ).rejects.toThrow(/"\*\*\/\*\.md"/);
    await expect(
      runConfigSetup({}, { ignorePatterns: ["**/*.md"] }),
    ).resolves.toBeDefined();
  });
});

/** Runs a hook that takes no params Astro's fakes need to provide. */
async function runHook(
  integration: ReturnType<typeof astroServeDocsFiles>,
  hookName: "astro:server:setup" | "astro:build:start",
) {
  const hook = integration.hooks[hookName] as (params: unknown) => unknown;
  await hook({ server: { watcher: { add: () => {}, on: () => {} } } });
}

/** Every file under `dirPath` (relative path → bytes as hex). */
function snapshotTree(dirPath: string): Record<string, string> {
  const treeSnapshot: Record<string, string> = {};
  for (const entry of readdirSync(dirPath, {
    recursive: true,
    withFileTypes: true,
  })) {
    const filePath = join(entry.parentPath, entry.name);
    treeSnapshot[relative(dirPath, filePath)] = entry.isFile()
      ? readFileSync(filePath).toString("hex")
      : "dir";
  }
  return treeSnapshot;
}

describe("astroServeDocsFiles dev setup and build start", () => {
  it.each(["astro:server:setup", "astro:build:start"] as const)(
    "leaves an existing public/ tree byte-identical (%s)",
    async (hookName) => {
      const { rootDirPath, integration } = await runConfigSetup({
        "public/favicon.svg": "<svg/>",
        "public/images/logo.png": "png",
        "public/fonts/": "",
        "public/guide/page.md": "a stale copy",
        "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
        "src/content/docs/guide/diagram.pdf": "pdf",
        "src/content/docs/images/other.png": "png",
      });
      const publicDirPath = join(rootDirPath, "public");
      const publicTreeBefore = snapshotTree(publicDirPath);

      await runHook(integration, hookName);

      expect(snapshotTree(publicDirPath)).toEqual(publicTreeBefore);
    },
  );

  it.each(["astro:server:setup", "astro:build:start"] as const)(
    "fails, naming the file, when a doc's frontmatter can't be parsed (%s)",
    async (hookName) => {
      const { integration } = await runConfigSetup({
        "src/content/docs/guide/broken.md": "---\ntitle: [unclosed\n---\n",
      });

      await expect(runHook(integration, hookName)).rejects.toThrow(
        /broken\.md/,
      );
    },
  );
});

describe("astroServeDocsFiles servedFileRule", () => {
  it("serves source docs and docs assets, leaving out drafts, _/. prefixes and ignorePatterns", async () => {
    const { integration } = await runConfigSetup(
      {
        "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
        "src/content/docs/guide/hidden.mdx":
          "---\ntitle: Hidden\nsidebar:\n  hidden: true\n---\n",
        "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
        "src/content/docs/guide/draft-figure.png": "png",
        "src/content/docs/guide/_partial.md": "---\ntitle: Partial\n---\n",
        "src/content/docs/_assets/logo.png": "png",
        "src/content/docs/.obsidian/workspace.json": "{}",
        "src/content/docs/guide/notes.txt": "scratch",
        "src/content/docs/scratch/figure.png": "png",
      },
      { ignorePatterns: ["**/*.txt", "scratch"] },
    );
    const { servedFileRule } = integration;

    expect(servedFileRule("guide/page.md")).toBe(true);
    expect(servedFileRule("guide/hidden.mdx")).toBe(true);
    expect(servedFileRule("guide/draft-figure.png")).toBe(true);
    expect(servedFileRule("guide/draft.md")).toBe(false);
    expect(servedFileRule("guide/_partial.md")).toBe(false);
    expect(servedFileRule("_assets/logo.png")).toBe(false);
    expect(servedFileRule(".obsidian/workspace.json")).toBe(false);
    expect(servedFileRule("guide/notes.txt")).toBe(false);
    expect(servedFileRule("scratch/figure.png")).toBe(false);
  });

  it("reads drafts from the docs dir under Astro's srcDir", async () => {
    const { integration } = await runConfigSetup(
      { "site-src/content/docs/draft.md": "---\ndraft: true\n---\n" },
      {},
      { srcDir: "site-src/" },
    );

    expect(integration.servedFileRule("draft.md")).toBe(false);
  });

  it("throws, naming the file, on unparseable frontmatter", async () => {
    const { integration } = await runConfigSetup({
      "src/content/docs/broken.md": "---\ntitle: [unclosed\n---\n",
    });

    expect(() => integration.servedFileRule("broken.md")).toThrow(/broken\.md/);
  });

  it("also exposes it as a custom hook, since Astro drops other fields from config.integrations", () => {
    const integration = astroServeDocsFiles();

    expect(integration.hooks["astro-serve-docs-files:served-file-rule"]).toBe(
      integration.servedFileRule,
    );
  });
});
