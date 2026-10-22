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
import { minimatch } from "minimatch";
import {
  createServedFileRule,
  type ServedFileRule,
} from "../utils/served-file-rule.js";
import {
  DOCS_FILE_ROUTE_PATTERN,
  SERVE_DOCS_FILES_INTEGRATION_NAME,
  SERVED_FILE_RULE_HOOK_NAME,
} from "../utils/serve-docs-files-integration.js";
import { SOURCE_DOC_EXTENSIONS } from "../utils/workspace-utils.js";
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

export type { ServedFileRule };

const css = String.raw;

const pageSrcStyles = css`
  .page-src-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    padding: 12px 24px;
    text-align: center;
    font-size: 14px;
    font-family: inherit;
    transform: translateY(-100%);
    transition: transform 0.25s ease;
  }

  .page-src-banner--success {
    background: #2da44e;
    color: #fff;
  }

  .page-src-banner--error {
    background: #cf222e;
    color: #fff;
  }

  .page-src-banner--visible {
    transform: translateY(0);
  }

  .page-src-h1-wrapper {
    position: relative;
  }

  @keyframes page-src-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .page-src-action-bar {
    position: absolute;
    top: -30px;
    right: -5px;
  }

  .page-src-action-bar__btn {
    position: relative;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--sl-color-hairline);
    border-radius: 6px;
    background: transparent;
    color: var(--sl-color-text);
    cursor: pointer;
    font-size: 16px;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-src-action-bar__btn:hover {
    background: var(--sl-color-bg-nav);
  }

  @keyframes page-src-glow {
    0% {
      box-shadow: 0 0 0 0 transparent;
    }
    30% {
      box-shadow: 0 0 12px 4px var(--sl-color-accent);
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  .page-src-action-bar__btn--glow {
    animation: page-src-glow 1s ease-out;
  }

  .page-src-action-bar__btn--loading {
    cursor: default;
    pointer-events: none;
    color: transparent;
  }

  .page-src-action-bar__btn--loading::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--sl-color-text);
    border-top-color: transparent;
    border-radius: 50%;
    animation: page-src-spin 0.6s linear infinite;
  }

  .page-src-action-bar__menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 160px;
    border: 1px solid var(--sl-color-hairline);
    border-radius: 6px;
    background: var(--sl-color-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    overflow: hidden;
  }

  .page-src-action-bar__menu--open {
    display: block;
  }

  .page-src-action-bar__menu-item {
    display: block;
    width: 100%;
    padding: 6px 16px;
    border: none;
    background: transparent;
    color: var(--sl-color-text);
    text-align: left;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    line-height: 1.5;
  }

  .page-src-action-bar__menu-item:hover {
    background: var(--sl-color-bg-nav);
  }
`;

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
   * the page action dropdown menu, each opening the respective chat app with
   * a prompt pre-filled to read the current page's raw markdown URL.
   *
   * Independent of `exposePageSrcButton` — enabling this on its own still
   * injects the dropdown button, containing only the "Ask" entries.
   */
  enableAskAiOption?: boolean;
}

/** The integration object `astroServeDocsFiles` returns. */
export type AstroServeDocsFilesIntegration = AstroIntegration & {
  /**
   * The resolved served-file rule: whether a path relative to the docs directory is served.
   * It leaves out drafts, any file or dir whose name starts with `_` or `.` (and everything
   * under one) and `ignorePatterns` matches, and throws on unparseable frontmatter. Callable
   * once `astro:config:setup` has run, since the docs directory comes from Astro's config.
   * Astro keeps only `name` and `hooks` in `config.integrations`, so other integrations
   * find this one there by name and read the same rule from its
   * `astro-serve-docs-files:served-file-rule` hook.
   */
  servedFileRule: ServedFileRule;
};

const SETTINGS_MODULE_ID = "virtual:astro-serve-docs-files/settings";

function validateOptions(options: AstroServeDocsFilesOptions): void {
  const sourceDocProbePaths = SOURCE_DOC_EXTENSIONS.flatMap((extension) => [
    `test${extension}`,
    `foo/test${extension}`,
  ]);

  const needsRawMd = options.exposePageSrcButton || options.enableAskAiOption;
  if (!needsRawMd) return;

  const offendingMdPatterns = (options.ignorePatterns ?? []).filter((pattern) =>
    sourceDocProbePaths.some((probe) =>
      minimatch(probe, pattern, { dot: true }),
    ),
  );

  const offendingMdPatternsList = offendingMdPatterns
    .map((pattern) => `    - "${pattern}"`)
    .join("\n");

  if (offendingMdPatterns.length > 0) {
    throw new Error(
      `The 'exposePageSrcButton'/'enableAskAiOption' option is enabled but the following 'ignorePatterns' values conflict with it: \n${offendingMdPatternsList}\n\n` +
        `Since these ignore patterns match source docs, the page action button would break. Either disable these options or remove these patterns.`,
    );
  }
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
        config,
        injectRoute,
        injectScript,
        updateConfig,
      }) => {
        validateOptions(options);

        const docsDirPath = fileURLToPath(
          new URL("content/docs/", config.srcDir),
        ).replace(/[\\/]+$/, "");
        routeSettings = { docsDirPath, ignorePatterns };
        publicDirPath = fileURLToPath(config.publicDir);
        ignoresPrerenderConflicts =
          config.prerenderConflictBehavior === "ignore";
        resolvedServedFileRule = createServedFileRule(routeSettings);

        const resolvedSettingsModuleId = `\0${SETTINGS_MODULE_ID}`;
        const settingsModuleSource = `export default ${JSON.stringify(routeSettings)};`;
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

        if (exposePageSrcButton || enableAskAiOption) {
          injectScript(
            "page",
            `
            const styleElement = document.createElement('style');
            styleElement.textContent = ${JSON.stringify(pageSrcStyles)};
            document.head.appendChild(styleElement);
          `,
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
