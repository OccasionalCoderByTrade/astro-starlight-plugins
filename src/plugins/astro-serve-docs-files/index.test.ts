import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
    server: {
      watcher: { add: () => {}, on: () => {} },
      middlewares: { use: () => {} },
    },
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
        "public/guide/old-page.md": "a user file",
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

describe("astroServeDocsFiles public/ collisions at startup", () => {
  it.each(["astro:server:setup", "astro:build:start"] as const)(
    "fails listing every clash with both files and the stale 3.x note (%s)",
    async (hookName) => {
      const { rootDirPath, integration } = await runConfigSetup({
        "public/guide/page.md": "a stale copy",
        "public/reference/notes.pdf": "stale pdf",
        "public/favicon.svg": "<svg/>",
        "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
        "src/content/docs/reference/notes.pdf": "pdf",
        "src/content/docs/reference/other.pdf": "pdf",
      });

      const error = await runHook(integration, hookName).then(
        () => undefined,
        (thrown: Error) => thrown,
      );

      expect(error?.message).toContain(
        join(rootDirPath, "public/guide/page.md"),
      );
      expect(error?.message).toContain(
        join(rootDirPath, "src/content/docs/guide/page.md"),
      );
      expect(error?.message).toContain(
        join(rootDirPath, "public/reference/notes.pdf"),
      );
      expect(error?.message).toContain(
        join(rootDirPath, "src/content/docs/reference/notes.pdf"),
      );
      expect(error?.message).not.toContain("other.pdf");
      expect(error?.message).not.toContain("favicon.svg");
      expect(error?.message).toContain(
        "Alternatively, it may be a stale holdover from a previous version of starlight-cannoli-plugins's syncDocsToPublic 3.0.0 plugin.",
      );
    },
  );

  it.each(["astro:server:setup", "astro:build:start"] as const)(
    "ignores public/ files whose docs twin isn't served (%s)",
    async (hookName) => {
      const { integration } = await runConfigSetup(
        {
          "public/guide/draft.md": "x",
          "public/guide/_partial.md": "x",
          "public/_assets/logo.png": "x",
          "public/.obsidian/workspace.json": "x",
          "public/scratch/figure.png": "x",
          "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
          "src/content/docs/guide/_partial.md": "---\ntitle: P\n---\n",
          "src/content/docs/_assets/logo.png": "png",
          "src/content/docs/.obsidian/workspace.json": "{}",
          "src/content/docs/scratch/figure.png": "png",
        },
        { ignorePatterns: ["scratch"] },
      );

      await expect(runHook(integration, hookName)).resolves.toBeUndefined();
    },
  );

  it("reads public/ from Astro's publicDir", async () => {
    const { integration } = await runConfigSetup(
      {
        "static/notes.pdf": "stale",
        "src/content/docs/notes.pdf": "pdf",
      },
      {},
      { publicDir: "static/" },
    );

    await expect(runHook(integration, "astro:build:start")).rejects.toThrow(
      /static\/notes\.pdf/,
    );
  });
});

type TDevMiddleware = (
  request: { url?: string },
  response: TFakeResponse,
  next: () => void,
) => void;
type TFakeResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

/** Runs `astro:server:setup` with a fake dev server. Returns the middlewares it added. */
async function runDevServerSetup(
  integration: ReturnType<typeof astroServeDocsFiles>,
) {
  const devMiddlewares: TDevMiddleware[] = [];
  const hook = integration.hooks["astro:server:setup"] as (
    params: unknown,
  ) => unknown;
  await hook({
    server: {
      watcher: { add: () => {}, on: () => {} },
      middlewares: {
        use: (middleware: TDevMiddleware) => devMiddlewares.push(middleware),
      },
    },
  });
  return devMiddlewares;
}

/** Sends a request for `url` through `devMiddlewares` in order, like Connect does. */
function requestDevServer(devMiddlewares: TDevMiddleware[], url: string) {
  const response: TFakeResponse = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      response.headers[name.toLowerCase()] = value;
    },
    end(body) {
      response.body = body;
    },
  };
  let reachedNext = false;
  const runFrom = (i: number) => {
    if (i >= devMiddlewares.length) {
      reachedNext = true;
      return;
    }
    devMiddlewares[i]({ url }, response, () => runFrom(i + 1));
  };
  runFrom(0);
  return { response, reachedNext };
}

describe("astroServeDocsFiles public/ collisions mid-session in dev", () => {
  it("answers an error at the clashing URL and keeps serving other URLs", async () => {
    const { rootDirPath, integration } = await runConfigSetup({
      "public/favicon.svg": "<svg/>",
      "src/content/docs/reference/List Syntax.md": "---\ntitle: L\n---\n",
      "src/content/docs/reference/notes.pdf": "pdf",
    });
    const devMiddlewares = await runDevServerSetup(integration);
    mkdirSync(join(rootDirPath, "public/reference"), { recursive: true });
    writeFileSync(
      join(rootDirPath, "public/reference/List Syntax.md"),
      "stale",
    );

    const clash = requestDevServer(
      devMiddlewares,
      "/reference/List%20Syntax.md",
    );

    expect(clash.reachedNext).toBe(false);
    expect(clash.response.statusCode).toBe(500);
    expect(clash.response.body).toContain(
      join(rootDirPath, "public/reference/List Syntax.md"),
    );
    expect(clash.response.body).toContain(
      join(rootDirPath, "src/content/docs/reference/List Syntax.md"),
    );
    expect(clash.response.body).toContain("syncDocsToPublic 3.0.0");
    expect(
      requestDevServer(devMiddlewares, "/reference/notes.pdf").reachedNext,
    ).toBe(true);
    expect(requestDevServer(devMiddlewares, "/favicon.svg").reachedNext).toBe(
      true,
    );
    expect(requestDevServer(devMiddlewares, "/guide/?x=1").reachedNext).toBe(
      true,
    );
  });

  it("lets a public/ file through when its docs twin isn't served", async () => {
    const { rootDirPath, integration } = await runConfigSetup({
      "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
    });
    const devMiddlewares = await runDevServerSetup(integration);
    mkdirSync(join(rootDirPath, "public/guide"), { recursive: true });
    writeFileSync(join(rootDirPath, "public/guide/draft.md"), "mine");

    expect(
      requestDevServer(devMiddlewares, "/guide/draft.md").reachedNext,
    ).toBe(true);
  });
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
