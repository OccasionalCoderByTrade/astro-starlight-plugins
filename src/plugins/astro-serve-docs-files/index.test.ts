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
      runConfigSetup(
        {},
        { enableAskAiOption: true, ignorePatterns: ["**/*.md"] },
      ),
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
  await hook({
    server: { watcher: { add: () => {}, on: () => {} } },
    logger: { options: makeLogOptions().logOptions },
  });
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
});

/** Astro's log options: the destination every Astro and integration logger writes to. */
function makeLogOptions(level = "info") {
  const writtenMessages: string[] = [];
  const logOptions = {
    level,
    destination: {
      write: (event: { label: string; level: string; message: string }) => {
        writtenMessages.push(event.message);
      },
    },
  };
  return { logOptions, writtenMessages };
}

type TLogOptions = ReturnType<typeof makeLogOptions>["logOptions"];

/** Logs a warning the way Astro's logger does: dropped when the log level hides it. */
function astroWarn(logOptions: TLogOptions, label: string, message: string) {
  const levelOrder = ["debug", "info", "warn", "error", "silent"];
  if (levelOrder.indexOf(logOptions.level) > levelOrder.indexOf("warn")) {
    return;
  }
  logOptions.destination.write({ label, level: "warn", message });
}

/** Astro's warning when two routes render the same URL and it drops the lower-priority one. */
function routeConflictWarning(
  pathname: string,
  losingRoutePattern: string,
  winningRoutePattern: string,
) {
  return (
    `Could not render \`${pathname}\` from route \`${losingRoutePattern}\` as it ` +
    `conflicts with higher priority route \`${winningRoutePattern}\`.`
  );
}

/**
 * Runs `astro:build:start`, then `duringBuild` (where Astro would render pages), then
 * `astro:build:done` with a fake `assets` map of route pattern → output files.
 */
async function runBuild(
  integration: ReturnType<typeof astroServeDocsFiles>,
  rootDirPath: string,
  assets: Record<string, string[]>,
  options: { logOptions?: TLogOptions; duringBuild?: () => void } = {},
) {
  const logger = { options: options.logOptions ?? makeLogOptions().logOptions };
  const buildStartHook = integration.hooks["astro:build:start"] as (
    params: unknown,
  ) => unknown;
  const buildDoneHook = integration.hooks["astro:build:done"] as (
    params: unknown,
  ) => unknown;
  await buildStartHook({ logger });
  options.duringBuild?.();
  const distDirUrl = pathToFileURL(join(rootDirPath, "dist") + "/");
  await buildDoneHook({
    logger,
    dir: distDirUrl,
    assets: new Map(
      Object.entries(assets).map(([routePattern, distRelativeFilePaths]) => [
        routePattern,
        distRelativeFilePaths.map(
          (distRelativeFilePath) => new URL(distRelativeFilePath, distDirUrl),
        ),
      ]),
    ),
  });
}

const EMPTY_DOCS_DIR = { "src/content/docs/": "" };

describe("astroServeDocsFiles collisions with other routes", () => {
  it("fails build:done, listing every output file the endpoint shares with another route and both routes", async () => {
    const { rootDirPath, integration } = await runConfigSetup(EMPTY_DOCS_DIR);

    await expect(
      runBuild(integration, rootDirPath, {
        "/[...path]": [
          "guide/page.md",
          "reference/baz/index.html",
          "zap/index.html",
        ],
        "/[...slug]": ["index.html", "reference/baz/index.html"],
        "/zap": ["zap/index.html"],
      }),
    ).rejects.toThrow(
      /2 served path collisions[\s\S]*reference\/baz\/index\.html[\s\S]*\/\[\.\.\.path\][\s\S]*\/\[\.\.\.slug\][\s\S]*zap\/index\.html[\s\S]*\/\[\.\.\.path\][\s\S]*\/zap\b/,
    );
  });

  it("passes build:done when the endpoint shares no output file", async () => {
    const { rootDirPath, integration } = await runConfigSetup(EMPTY_DOCS_DIR);

    await expect(
      runBuild(integration, rootDirPath, {
        "/[...path]": ["guide/page.md", "guide/diagram.pdf"],
        "/[...slug]": ["index.html", "guide/page/index.html"],
        "/404": ["404.html"],
      }),
    ).resolves.toBeUndefined();
  });

  it("fails build:done on a URL the endpoint and another route both render, which Astro only warns about", async () => {
    const { rootDirPath, integration } = await runConfigSetup(EMPTY_DOCS_DIR);
    const { logOptions, writtenMessages } = makeLogOptions();

    await expect(
      runBuild(
        integration,
        rootDirPath,
        { "/[...path]": ["reference/bar"], "/[...slug]": ["index.html"] },
        {
          logOptions,
          duringBuild: () => {
            astroWarn(
              logOptions,
              "build",
              routeConflictWarning(
                "/reference/bar",
                "/[...slug]",
                "/[...path]",
              ),
            );
            astroWarn(
              logOptions,
              "build",
              routeConflictWarning("/notes.json", "/[...path]", "/notes.json"),
            );
          },
        },
      ),
    ).rejects.toThrow(
      /2 served path collisions[\s\S]*\/notes\.json[\s\S]*\/\[\.\.\.path\][\s\S]*\/notes\.json[\s\S]*\/reference\/bar[\s\S]*\/\[\.\.\.path\][\s\S]*\/\[\.\.\.slug\]/,
    );
    // Astro's own warning is still shown
    expect(writtenMessages).toHaveLength(2);
  });

  it("finds those URL clashes even when the log level hides warnings, without showing them", async () => {
    const { rootDirPath, integration } = await runConfigSetup(EMPTY_DOCS_DIR);
    const { logOptions, writtenMessages } = makeLogOptions("silent");

    await expect(
      runBuild(
        integration,
        rootDirPath,
        { "/[...path]": ["reference/bar"] },
        {
          logOptions,
          duringBuild: () =>
            astroWarn(
              logOptions,
              "build",
              routeConflictWarning(
                "/reference/bar",
                "/[...slug]",
                "/[...path]",
              ),
            ),
        },
      ),
    ).rejects.toThrow(/1 served path collision\b[\s\S]*\/reference\/bar/);
    expect(writtenMessages).toEqual([]);
    expect(logOptions.level).toBe("silent");
  });

  it("ignores URL clashes between other routes, and stops listening once the build is done", async () => {
    const { rootDirPath, integration } = await runConfigSetup(EMPTY_DOCS_DIR);
    const { logOptions, writtenMessages } = makeLogOptions();
    const originalDestination = logOptions.destination;
    const otherConflictWarning = routeConflictWarning("/a", "/[...slug]", "/a");

    await expect(
      runBuild(
        integration,
        rootDirPath,
        { "/[...path]": ["guide/page.md"] },
        {
          logOptions,
          duringBuild: () =>
            astroWarn(logOptions, "build", otherConflictWarning),
        },
      ),
    ).resolves.toBeUndefined();
    expect(writtenMessages).toEqual([otherConflictWarning]);
    expect(logOptions.destination).toBe(originalDestination);
  });
});
