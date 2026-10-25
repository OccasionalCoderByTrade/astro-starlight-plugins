/**
 * Astro integration that serves every raw doc and docs asset at its path under the docs
 * directory, through one injected, prerendered `/[...path]` route. In dev the route reads
 * each file from source on request; in a build Astro writes each one into the output
 * directory. Nothing is written to or deleted from `public/`.
 */
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import type { ViteDevServer } from "vite";
import {
  createServedFileRule,
  type ServedFileRule,
} from "../utils/served-file-rule.js";
import {
  DOCS_FILE_ROUTE_PATTERN,
  SERVE_DOCS_FILES_INTEGRATION_NAME,
  SERVED_FILE_RULE_HOOK_NAME,
} from "../utils/serve-docs-files-integration.js";
import { pluginStylesImportScript } from "../utils/plugin-styles.js";
import { getSourceDocExtensions } from "../utils/workspace-utils.js";
import type { TDocsFileRouteSettings } from "./docs-file-route.js";
import {
  createPublicServedPathCollisionMiddleware,
  findPublicServedPathCollisions,
  formatPublicServedPathCollisionsMessage,
} from "./public-served-path-collisions.js";
import {
  formatRouteCollisionsError,
  listenForRouteConflicts,
} from "./route-collisions.js";
import {
  SETTINGS_MODULE_ID,
  type TServeDocsFilesModuleSettings,
} from "./utils.js";

export type { ServedFileRule };

export interface AstroServeDocsFilesOptions {
  /**
   * Glob patterns for files not to serve.
   * Patterns are matched against paths relative to the docs directory (`src/content/docs/`).
   * A pattern that matches a directory leaves out everything under it.
   * Example: ["**\/*.txt", "drafts"]
   */
  ignorePatterns?: string[];
  /**
   * When true, injects a client-side script that runs on every page in both
   * dev and build modes.
   */
  exposePageSrcButton?: boolean;
  /**
   * When true, adds "Ask ChatGPT", "Ask Claude", and "Ask Gemini" entries to
   * the page-action bar, each opening the respective chat app with
   * a prompt pre-filled to read the current page's raw markdown URL.
   *
   * Independent of `exposePageSrcButton` — enabling this on its own still
   * adds the page-action bar, with only the "Ask" entries.
   */
  enableAskAiOption?: boolean;
}

/** The integration object `astroServeDocsFiles` returns. */
export type AstroServeDocsFilesIntegration = AstroIntegration & {
  /**
   * The resolved served-file rule: whether a path relative to the docs directory is served.
   * It leaves out any file or dir whose name starts with `_` or `.` (and everything under
   * one), `ignorePatterns` matches and, outside `astro dev`, drafts. It throws on
   * unparseable frontmatter. It's fixed to the mode Astro runs in, so callers needn't know
   * it. Callable
   * once `astro:config:setup` has run, since the docs directory comes from Astro's config.
   * Astro keeps only `name` and `hooks` in `config.integrations`, so other integrations
   * find this one there by name and read the same rule from its
   * `astro-serve-docs-files:served-file-rule` hook.
   */
  servedFileRule: ServedFileRule;
};

/** A dir URL from Astro's config as a file path, without a trailing separator. */
function toDirPath(dirUrl: URL): string {
  return fileURLToPath(dirUrl).replace(/[\\/]+$/, "");
}

/**
 * Where a module shipped next to this file lives: `.ts` in this repo, or a separate build
 * entry in `dist/` reached from either this plugin's own entry or the root entry's chunk.
 */
function siblingModuleUrl(moduleName: string): URL {
  const currentFilePath = fileURLToPath(import.meta.url);
  if (currentFilePath.endsWith(".ts")) {
    return new URL(`./${moduleName}.ts`, import.meta.url);
  }
  if (currentFilePath.endsWith("astro-serve-docs-files.js")) {
    return new URL(
      `./astro-serve-docs-files/${moduleName}.js`,
      import.meta.url,
    );
  }
  return new URL(
    `./plugins/astro-serve-docs-files/${moduleName}.js`,
    import.meta.url,
  );
}

/**
 * Clears Astro's dev route cache, so the endpoint's `getStaticPaths` reruns and picks up an
 * added or deleted docs file. `astro:content-changed` is internal Astro API, not public, so
 * this is the only place that sends it; an Astro upgrade that breaks it breaks it here.
 */
function clearRouteCache(server: ViteDevServer): void {
  for (const environment of Object.values(server.environments)) {
    if (environment.name === "client") continue;
    environment.hot.send("astro:content-changed", {});
  }
}

export function astroServeDocsFiles(
  options: AstroServeDocsFilesOptions = {},
): AstroServeDocsFilesIntegration {
  const {
    ignorePatterns = [],
    exposePageSrcButton = false,
    enableAskAiOption = false,
  } = options;
  let routeSettings: TDocsFileRouteSettings | undefined;
  let resolvedServedFileRule: ServedFileRule | undefined;
  let publicDirPath: string | undefined;
  let ignoresPrerenderConflicts = false;
  let routeConflictListener:
    ReturnType<typeof listenForRouteConflicts> | undefined;

  const servedFileRule: ServedFileRule = (docsRelativeEntryPath) => {
    if (!resolvedServedFileRule) {
      throw new Error(
        `[${SERVE_DOCS_FILES_INTEGRATION_NAME}] servedFileRule was called before astro:config:setup ran.`,
      );
    }
    return resolvedServedFileRule(docsRelativeEntryPath);
  };

  // Fails dev and build at startup on unparseable frontmatter or a served path collision with
  // public/,
  // rather than on a request (ADR 0008)
  const checkServedFiles = () => {
    if (!routeSettings || !publicDirPath) return;
    const publicServedPathCollisions = findPublicServedPathCollisions(
      { docsDirPath: routeSettings.docsDirPath, publicDirPath },
      servedFileRule,
    );
    if (publicServedPathCollisions.length > 0) {
      throw new Error(
        formatPublicServedPathCollisionsMessage(publicServedPathCollisions),
      );
    }
  };

  // Mid-session, a bad save only logs, so it doesn't stop the dev server
  const logUnparseableFrontmatter = (
    relativeFilePath: string,
    logger: AstroIntegrationLogger,
  ) => {
    try {
      servedFileRule(relativeFilePath);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
    }
  };

  return {
    name: SERVE_DOCS_FILES_INTEGRATION_NAME,
    servedFileRule,
    hooks: {
      // Astro's config validation keeps only `name` and `hooks` of each integration in
      // `config.integrations`, so other integrations read the rule from here
      [SERVED_FILE_RULE_HOOK_NAME]: servedFileRule,
      "astro:config:setup": ({
        command,
        config,
        addMiddleware,
        injectRoute,
        injectScript,
        updateConfig,
      }) => {
        const docsDirPath = toDirPath(new URL("content/docs/", config.srcDir));
        // Like Starlight, which renders draft pages in dev and drops them from builds
        routeSettings = {
          docsDirPath,
          ignorePatterns,
          serveDrafts: command === "dev",
          sourceDocExtensions: getSourceDocExtensions(config.integrations),
        };
        publicDirPath = fileURLToPath(config.publicDir);
        ignoresPrerenderConflicts =
          config.prerenderConflictBehavior === "ignore";
        resolvedServedFileRule = createServedFileRule(routeSettings);

        const resolvedSettingsModuleId = `\0${SETTINGS_MODULE_ID}`;
        // The route and the raw doc alternate link middleware both read this module
        const moduleSettings: TServeDocsFilesModuleSettings = {
          rootDirPath: toDirPath(config.root),
          // The injected route is served under `base` too
          baseUrlPath: config.base.replace(/\/+$/, ""),
          ...routeSettings,
        };
        const settingsModuleSource = `export default ${JSON.stringify(moduleSettings)};`;
        updateConfig({
          vite: {
            plugins: [
              {
                name: "astro-serve-docs-files-settings",
                resolveId: (id: string) =>
                  id === SETTINGS_MODULE_ID
                    ? resolvedSettingsModuleId
                    : undefined,
                load: (id: string) =>
                  id === resolvedSettingsModuleId
                    ? settingsModuleSource
                    : undefined,
              },
            ],
          },
        });
        injectRoute({
          pattern: DOCS_FILE_ROUTE_PATTERN,
          entrypoint: siblingModuleUrl("route"),
          prerender: true,
        });
        // On every doc page, whether or not the page-action bar is on (ADR 0012)
        addMiddleware({
          entrypoint: siblingModuleUrl("raw-doc-alternate-link-middleware"),
          order: "post",
        });

        if (exposePageSrcButton || enableAskAiOption) {
          injectScript(
            "page-ssr",
            pluginStylesImportScript(["plugins/astro-serve-docs-files/styles"]),
          );
          const scriptPath = JSON.stringify(
            fileURLToPath(siblingModuleUrl("page-script")),
          );
          const actionBarOptions = JSON.stringify({
            exposePageSrcButton,
            enableAskAiOption,
          });
          injectScript(
            "page",
            `import { initPageActionBar } from ${scriptPath};\ninitPageActionBar(${actionBarOptions});`,
          );
        }
      },

      "astro:build:start": ({ logger }) => {
        checkServedFiles();
        // Astro logs nothing for a URL clash then, so there's no warning to collect
        if (ignoresPrerenderConflicts) {
          logger.warn(
            `prerenderConflictBehavior is "ignore", so a URL that the docs file endpoint ` +
              `and another route both render can't be detected: Astro keeps one route's ` +
              `output there without logging it. Set it to "warn" or "error" to catch these.`,
          );
        }
        routeConflictListener = listenForRouteConflicts(logger.options);
      },

      "astro:server:setup": ({ server, logger }) => {
        checkServedFiles();
        if (!routeSettings || !publicDirPath) return;
        const { docsDirPath } = routeSettings;

        server.middlewares.use(
          createPublicServedPathCollisionMiddleware(
            { docsDirPath, publicDirPath },
            servedFileRule,
          ),
        );

        server.watcher.on("all", (event, filePath) => {
          if (!filePath.startsWith(docsDirPath + sep)) return;
          if (event === "add" || event === "unlink") clearRouteCache(server);
          if (event === "add" || event === "change") {
            logUnparseableFrontmatter(relative(docsDirPath, filePath), logger);
          }
        });
      },

      // Astro on its own only warns about some of these and misses the rest
      "astro:build:done": ({ dir, assets }) => {
        routeConflictListener?.stop();
        if (!routeSettings) return;
        const routeCollisionsError = formatRouteCollisionsError({
          assets,
          routeConflicts: routeConflictListener?.routeConflicts ?? [],
          distDirPath: fileURLToPath(dir),
          docsDirPath: routeSettings.docsDirPath,
        });
        if (routeCollisionsError) throw new Error(routeCollisionsError);
      },
    },
  };
}
