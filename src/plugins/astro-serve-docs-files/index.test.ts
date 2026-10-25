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
type TAddedMiddleware = {
  entrypoint: string | URL;
  order: "pre" | "post";
};
type TVitePlugin = {
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
};

type TAstroCommand = "dev" | "build";

/**
 * Runs `astro:config:setup` for a project holding `files`, with a fake Astro config whose
 * `srcDir` and `publicDir` default to Astro's. Returns what the hook injected.
 */
async function runConfigSetup(
  files: Record<string, string>,
  options: AstroServeDocsFilesOptions = {},
  dirs: { srcDir?: string; publicDir?: string } = {},
  otherConfig: Record<string, unknown> = {},
  command: TAstroCommand = "dev",
) {
  const rootDirPath = makeFileTree(files);
  const rootUrl = pathToFileURL(rootDirPath + "/");
  const integration = astroServeDocsFiles(options);
  const injectedRoutes: TInjectedRoute[] = [];
  const addedMiddlewares: TAddedMiddleware[] = [];
  const vitePlugins: TVitePlugin[] = [];
  const configSetupHook = integration.hooks["astro:config:setup"] as (
    params: unknown,
  ) => Promise<void> | void;
  await configSetupHook({
    command,
    config: {
      root: rootUrl,
      srcDir: new URL(dirs.srcDir ?? "src/", rootUrl),
      publicDir: new URL(dirs.publicDir ?? "public/", rootUrl),
      base: "/",
      integrations: [],
      ...otherConfig,
    },
    injectRoute: (route: TInjectedRoute) => injectedRoutes.push(route),
    addMiddleware: (middleware: TAddedMiddleware) =>
      addedMiddlewares.push(middleware),
    injectScript: () => {},
    updateConfig: (configUpdate: { vite?: { plugins?: TVitePlugin[] } }) => {
      vitePlugins.push(...(configUpdate.vite?.plugins ?? []));
    },
  });
  return {
    rootDirPath,
    integration,
    injectedRoutes,
    addedMiddlewares,
    vitePlugins,
  };
}

/**
 * The settings the route and the raw doc alternate link middleware import, as the
 * integration's Vite plugin serves them.
 */
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
      {},
      "build",
    );

    expect(loadRouteSettings(vitePlugins)).toEqual({
      rootDirPath,
      docsDirPath: join(rootDirPath, "site-src/content/docs"),
      ignorePatterns: ["scratch"],
      serveDrafts: false,
      sourceDocExtensions: [".md", ".mdx"],
      baseUrlPath: "",
    });
  });

  it.each([
    ["/docs", "/docs"],
    ["/docs/", "/docs"],
    ["/", ""],
  ])(
    "passes Astro's base %s on without a trailing slash, since the route is served under it",
    async (base, expectedBaseUrlPath) => {
      const { vitePlugins } = await runConfigSetup({}, {}, {}, { base });

      expect(loadRouteSettings(vitePlugins).baseUrlPath).toBe(
        expectedBaseUrlPath,
      );
    },
  );

  it.each([
    ["dev", true],
    ["build", false],
  ] as const)(
    "tells the route to serve drafts in %s: %s",
    async (command, expectedServeDrafts) => {
      const { vitePlugins } = await runConfigSetup({}, {}, {}, {}, command);

      expect(loadRouteSettings(vitePlugins).serveDrafts).toBe(
        expectedServeDrafts,
      );
    },
  );

  it.each([
    ["dev", { exposePageSrcButton: false, enableAskAiOption: false }],
    ["build", { exposePageSrcButton: false, enableAskAiOption: false }],
    ["build", { exposePageSrcButton: true, enableAskAiOption: true }],
  ] as const)(
    "adds a post middleware whose entrypoint exists, to add each page's raw doc alternate link in %s, with %o",
    async (command, options) => {
      const { addedMiddlewares } = await runConfigSetup(
        {},
        options,
        {},
        {},
        command,
      );

      expect(addedMiddlewares).toHaveLength(1);
      expect(addedMiddlewares[0].order).toBe("post");
      const entrypointUrl = new URL(String(addedMiddlewares[0].entrypoint));
      expect(existsSync(fileURLToPath(entrypointUrl))).toBe(true);
    },
  );

  it("accepts ignorePatterns that hide raw docs while the page-action bar is on", async () => {
    await expect(
      runConfigSetup(
        {},
        { enableAskAiOption: true, ignorePatterns: ["**/*.md"] },
      ),
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

describe("astroServeDocsFiles served path collisions with public/ at startup", () => {
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

      expect(error?.message).toContain("public/guide/page.md");
      expect(error?.message).toContain("src/content/docs/guide/page.md");
      expect(error?.message).toContain("public/reference/notes.pdf");
      expect(error?.message).toContain("src/content/docs/reference/notes.pdf");
      expect(error?.message).not.toContain(rootDirPath);
      expect(error?.message).not.toContain("other.pdf");
      expect(error?.message).not.toContain("favicon.svg");
      expect(error?.message).toContain(
        "One possible cause is a stale copy left in public/ by starlight-cannoli-plugins's syncDocsToPublic 3.x, in which case delete the public/ copy.",
      );
    },
  );

  it.each(["astro:server:setup", "astro:build:start"] as const)(
    "ignores public/ files whose docs twin isn't served (%s)",
    async (hookName) => {
      const { integration } = await runConfigSetup(
        {
          "public/guide/_partial.md": "x",
          "public/_assets/logo.png": "x",
          "public/.obsidian/workspace.json": "x",
          "public/scratch/figure.png": "x",
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

  it("fails dev startup on a draft that clashes with public/, which a build doesn't serve", async () => {
    const files = {
      "public/guide/draft.md": "a stale copy",
      "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
    };
    const dev = await runConfigSetup(files, {}, {}, {}, "dev");
    const build = await runConfigSetup(files, {}, {}, {}, "build");

    await expect(
      runHook(dev.integration, "astro:server:setup"),
    ).rejects.toThrow(/public\/guide\/draft\.md/);
    await expect(
      runHook(build.integration, "astro:build:start"),
    ).resolves.toBeUndefined();
  });

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
async function runDevMiddlewareSetup(
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

describe("astroServeDocsFiles served path collisions with public/ mid-session in dev", () => {
  it("answers an error at the clashing URL and keeps serving other URLs", async () => {
    const { rootDirPath, integration } = await runConfigSetup({
      "public/favicon.svg": "<svg/>",
      "src/content/docs/reference/List Syntax.md": "---\ntitle: L\n---\n",
      "src/content/docs/reference/notes.pdf": "pdf",
    });
    const devMiddlewares = await runDevMiddlewareSetup(integration);
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
    expect(clash.response.body).toContain("public/reference/List Syntax.md");
    expect(clash.response.body).toContain(
      "src/content/docs/reference/List Syntax.md",
    );
    expect(clash.response.body).not.toContain(rootDirPath);
    expect(clash.response.body).toContain("syncDocsToPublic 3.x");
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
      "src/content/docs/guide/_partial.md": "---\ntitle: P\n---\n",
    });
    const devMiddlewares = await runDevMiddlewareSetup(integration);
    mkdirSync(join(rootDirPath, "public/guide"), { recursive: true });
    writeFileSync(join(rootDirPath, "public/guide/_partial.md"), "mine");

    expect(
      requestDevServer(devMiddlewares, "/guide/_partial.md").reachedNext,
    ).toBe(true);
  });
});

describe("astroServeDocsFiles servedFileRule", () => {
  const servedFileRuleFiles = {
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
  };

  it.each([
    ["build", false],
    ["dev", true],
  ] as const)(
    "serves source docs and docs assets, leaving out _/. prefixes and ignorePatterns, and drafts only in a build (%s)",
    async (command, expectedDraftServed) => {
      const { integration } = await runConfigSetup(
        servedFileRuleFiles,
        { ignorePatterns: ["**/*.txt", "scratch"] },
        {},
        {},
        command,
      );
      const { servedFileRule } = integration;

      expect(servedFileRule("guide/page.md")).toBe(true);
      expect(servedFileRule("guide/hidden.mdx")).toBe(true);
      expect(servedFileRule("guide/draft-figure.png")).toBe(true);
      expect(servedFileRule("guide/draft.md")).toBe(expectedDraftServed);
      expect(servedFileRule("guide/_partial.md")).toBe(false);
      expect(servedFileRule("_assets/logo.png")).toBe(false);
      expect(servedFileRule(".obsidian/workspace.json")).toBe(false);
      expect(servedFileRule("guide/notes.txt")).toBe(false);
      expect(servedFileRule("scratch/figure.png")).toBe(false);
    },
  );

  it.each([
    ["guide/Why?.md", "src/content/docs/guide/Why?.md"],
    ["guide/#1.png", "src/content/docs/guide/#1.png"],
    ["Q&A?/notes.txt", "src/content/docs/Q&A?/notes.txt"],
  ])(
    "leaves out %s, since Astro keeps ? and # encoded in route params and can't serve it",
    async (docsRelativeFilePath, filePath) => {
      const { integration } = await runConfigSetup({ [filePath]: "" });

      expect(integration.servedFileRule(docsRelativeFilePath)).toBe(false);
    },
  );

  it.each([".markdown", ".mdown", ".mkdn", ".mkd", ".mdwn"])(
    "serves a %s file in a build without reading its frontmatter, since it's a docs asset",
    async (extension) => {
      const { integration } = await runConfigSetup(
        {
          [`src/content/docs/draft${extension}`]: "---\ndraft: true\n---\n",
          [`src/content/docs/broken${extension}`]:
            "---\ntitle: [unclosed\n---\n",
        },
        {},
        {},
        {},
        "build",
      );

      expect(integration.servedFileRule(`draft${extension}`)).toBe(true);
      expect(integration.servedFileRule(`broken${extension}`)).toBe(true);
    },
  );

  it("leaves out a .mdoc draft in a build when Markdoc is in the config", async () => {
    const { integration } = await runConfigSetup(
      { "src/content/docs/draft.mdoc": "---\ndraft: true\n---\n" },
      {},
      {},
      { integrations: [{ name: "@astrojs/markdoc", hooks: {} }] },
      "build",
    );

    expect(integration.servedFileRule("draft.mdoc")).toBe(false);
  });

  it("serves a .mdoc draft in a build when Markdoc isn't in the config", async () => {
    const { integration } = await runConfigSetup(
      { "src/content/docs/draft.mdoc": "---\ndraft: true\n---\n" },
      {},
      {},
      {},
      "build",
    );

    expect(integration.servedFileRule("draft.mdoc")).toBe(true);
  });

  it("reads drafts from the docs dir under Astro's srcDir", async () => {
    const { integration } = await runConfigSetup(
      { "site-src/content/docs/draft.md": "---\ndraft: true\n---\n" },
      {},
      { srcDir: "site-src/" },
      {},
      "build",
    );

    expect(integration.servedFileRule("draft.md")).toBe(false);
  });

  it.each(["dev", "build"] as const)(
    "throws, naming the file, on unparseable frontmatter (%s)",
    async (command) => {
      const { integration } = await runConfigSetup(
        { "src/content/docs/broken.md": "---\ntitle: [unclosed\n---\n" },
        {},
        {},
        {},
        command,
      );

      expect(() => integration.servedFileRule("broken.md")).toThrow(
        /broken\.md/,
      );
    },
  );

  it("also exposes it as a custom hook, since Astro drops other fields from config.integrations", () => {
    const integration = astroServeDocsFiles();

    expect(integration.hooks["astro-serve-docs-files:served-file-rule"]).toBe(
      integration.servedFileRule,
    );
  });
});

type TWatcherHandler = (event: string, filePath: string) => void;

/**
 * Runs `astro:server:setup` with a fake watcher, logger and Vite environments. `fire` sends
 * a watcher event for a path relative to the project root; `sentEvents` records each hot
 * event an environment was sent.
 */
async function runDevServerSetup(files: Record<string, string>) {
  const { rootDirPath, integration } = await runConfigSetup(files);
  const watcherHandlers: TWatcherHandler[] = [];
  const sentEvents: { environmentName: string; eventName: string }[] = [];
  const loggedErrors: string[] = [];
  const makeEnvironment = (environmentName: string) => ({
    name: environmentName,
    hot: {
      send: (eventName: string) =>
        sentEvents.push({ environmentName, eventName }),
    },
  });
  const serverSetupHook = integration.hooks["astro:server:setup"] as (
    params: unknown,
  ) => unknown;
  await serverSetupHook({
    server: {
      watcher: {
        add: () => {},
        on: (eventName: string, handler: TWatcherHandler) => {
          if (eventName === "all") watcherHandlers.push(handler);
        },
      },
      middlewares: { use: () => {} },
      environments: {
        client: makeEnvironment("client"),
        ssr: makeEnvironment("ssr"),
        prerender: makeEnvironment("prerender"),
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: (message: string) => loggedErrors.push(message),
    },
  });
  const fire = (event: string, relativeFilePath: string) => {
    for (const handler of watcherHandlers) {
      handler(event, join(rootDirPath, relativeFilePath));
    }
  };
  return { rootDirPath, fire, sentEvents, loggedErrors };
}

describe("astroServeDocsFiles live dev changes", () => {
  it.each(["add", "unlink"])(
    "clears the route cache in every non-client environment on %s under the docs dir",
    async (event) => {
      const { fire, sentEvents } = await runDevServerSetup({
        "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
      });

      fire(event, "src/content/docs/guide/diagram.pdf");

      expect(sentEvents).toEqual([
        { environmentName: "ssr", eventName: "astro:content-changed" },
        { environmentName: "prerender", eventName: "astro:content-changed" },
      ]);
    },
  );

  it("doesn't clear the route cache for edits, or for changes outside the docs dir", async () => {
    const { fire, sentEvents } = await runDevServerSetup({
      "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
      "src/content/docs-other/page.md": "",
    });

    fire("change", "src/content/docs/guide/page.md");
    fire("add", "src/components/Widget.astro");
    fire("unlink", "public/favicon.svg");
    fire("add", "src/content/docs-other/page.md");

    expect(sentEvents).toEqual([]);
  });

  it.each(["add", "change"])(
    "logs, naming the file, when a doc saved mid-session has unparseable frontmatter (%s)",
    async (event) => {
      const { rootDirPath, fire, loggedErrors } = await runDevServerSetup({
        "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
      });
      writeFileSync(
        join(rootDirPath, "src/content/docs/guide/page.md"),
        "---\ntitle: [unclosed\n---\n",
      );

      expect(() => fire(event, "src/content/docs/guide/page.md")).not.toThrow();

      expect(loggedErrors).toHaveLength(1);
      expect(loggedErrors[0]).toMatch(/page\.md/);
    },
  );

  it("logs nothing for a valid save", async () => {
    const { fire, loggedErrors } = await runDevServerSetup({
      "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
      "src/content/docs/guide/diagram.pdf": "pdf",
    });

    fire("change", "src/content/docs/guide/page.md");
    fire("add", "src/content/docs/guide/diagram.pdf");

    expect(loggedErrors).toEqual([]);
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

  it.each([
    ["ignore", 1],
    ["warn", 0],
    [undefined, 0],
  ] as const)(
    "warns at build start that URL clashes go unreported only when prerenderConflictBehavior is %s",
    async (prerenderConflictBehavior, expectedWarningCount) => {
      const { integration } = await runConfigSetup(
        EMPTY_DOCS_DIR,
        {},
        {},
        { prerenderConflictBehavior },
      );
      const loggedWarnings: string[] = [];
      const buildStartHook = integration.hooks["astro:build:start"] as (
        params: unknown,
      ) => unknown;

      await buildStartHook({
        logger: {
          options: makeLogOptions().logOptions,
          warn: (message: string) => loggedWarnings.push(message),
        },
      });

      expect(loggedWarnings).toHaveLength(expectedWarningCount);
      if (expectedWarningCount > 0) {
        expect(loggedWarnings[0]).toMatch(/prerenderConflictBehavior/);
      }
    },
  );

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
