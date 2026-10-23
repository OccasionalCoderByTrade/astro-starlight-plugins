import type { AstroIntegration } from "astro";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServedFileRule } from "../utils/served-file-rule.js";
import {
  DOCS_FILE_ROUTE_PATTERN,
  SERVE_DOCS_FILES_INTEGRATION_NAME,
  SERVED_FILE_RULE_HOOK_NAME,
} from "../utils/serve-docs-files-integration.js";
import { STARLIGHT_DOC_ROUTE } from "../utils/starlight-routes.js";
import { getSourceDocExtensions } from "../utils/workspace-utils.js";
import {
  buildSourceDocIndex,
  formatBrokenLinksError,
  formatPagePathCollisionsError,
  formatShadowedDocsError,
  processDocPage,
  registerServedFileRule,
  SETTINGS_MODULE_ID,
  STARLIGHT_404_PAGE_PATH,
  type TLocalLinksDevSettings,
  type TLocalLinksSettings,
  type TPageBrokenLinks,
} from "./utils.js";

export type AstroLocalLinksOptions = {
  /**
   * Link validation: fail on local links inside a page's content whose target doesn't exist.
   * `skipPatterns` holds globs matched against the link's site path (`/x/y#frag`), and for a
   * link to a source doc's file path, also its page path. Default: true.
   */
  validate?: boolean | { skipPatterns?: string[] };
  /**
   * Link normalization: rewrite relative local links to root-absolute ones, and links to a
   * source doc's file path to its page path. Default: true.
   */
  normalize?: boolean;
};

/**
 * Astro integration for the local links in Starlight's doc pages. It validates them and
 * rewrites relative ones to root-absolute, so they work whether or not the host adds a
 * trailing slash. It runs on each page's final HTML: in dev through middleware, in build
 * once every page is written.
 */
export function astroLocalLinks(
  options: AstroLocalLinksOptions = {},
): AstroIntegration {
  const { validate = true, normalize = true } = options;
  let settings: TLocalLinksSettings;
  // The serve plugin's endpoint, whose clashes with doc pages that plugin reports itself
  let docsFileRoutePattern: string | undefined;

  return {
    name: "astro-local-links",
    hooks: {
      "astro:config:setup": ({
        command,
        config,
        addMiddleware,
        updateConfig,
      }) => {
        if (config.base.replace(/\/+$/, "") !== "") {
          throw new Error(
            `[astro-local-links] Astro's \`base\` (${config.base}) is not supported yet.`,
          );
        }

        settings = {
          site: {
            rootDirPath: fileURLToPath(config.root),
            docsDirPath: fileURLToPath(new URL("content/docs/", config.srcDir)),
            publicDirPath: fileURLToPath(config.publicDir),
            sourceDocExtensions: getSourceDocExtensions(config.integrations),
            // `/_image` serves optimized images in dev, `/@fs/` and `/@id/` are Vite's
            generatedPathPrefixes: [
              "/_image",
              `/${config.build.assets}/`,
              "/@",
            ],
          },
          validate: validate && {
            skipPatterns:
              (validate === true ? {} : validate).skipPatterns ?? [],
          },
          normalize,
        };
        docsFileRoutePattern = config.integrations.some(
          ({ name }) => name === SERVE_DOCS_FILES_INTEGRATION_NAME,
        )
          ? DOCS_FILE_ROUTE_PATTERN
          : undefined;

        if (command !== "dev" || (!settings.validate && !settings.normalize)) {
          return;
        }
        // A file under the docs dir counts in dev if astroServeDocsFiles serves it. Its rule
        // is only kept here: it can't be called before that integration's own config:setup.
        // Astro keeps only `name` and `hooks` in `config.integrations`, so the rule is a hook
        const servedFileRule = config.integrations.find(
          (integration) =>
            integration.name === SERVE_DOCS_FILES_INTEGRATION_NAME,
        )?.hooks[SERVED_FILE_RULE_HOOK_NAME] as ServedFileRule | undefined;
        const devSettings: TLocalLinksDevSettings = {
          ...settings,
          servedFileRuleId: servedFileRule
            ? registerServedFileRule(servedFileRule)
            : undefined,
        };
        const resolvedSettingsModuleId = `\0${SETTINGS_MODULE_ID}`;
        updateConfig({
          vite: {
            plugins: [
              {
                name: "astro-local-links-settings",
                resolveId: (id: string) =>
                  id === SETTINGS_MODULE_ID
                    ? resolvedSettingsModuleId
                    : undefined,
                load: (id: string) =>
                  id === resolvedSettingsModuleId
                    ? `export default ${JSON.stringify(devSettings)};`
                    : undefined,
              },
            ],
          },
        });
        addMiddleware({ entrypoint: devMiddlewareUrl(), order: "post" });
      },

      "astro:build:done": async ({ dir, assets }) => {
        if (!settings.validate && !settings.normalize) return;

        const sourceDocIndex = buildSourceDocIndex(settings.site);
        const pagePathCollisionsError =
          formatPagePathCollisionsError(sourceDocIndex);
        if (pagePathCollisionsError) throw new Error(pagePathCollisionsError);

        // Astro only warns when another route takes a source doc's page path, unless
        // `prerenderConflictBehavior` is "error"
        const distDirPath = fileURLToPath(dir);
        const shadowedDocsError = formatShadowedDocsError(
          [...assets].flatMap(([routePattern, fileUrls]) =>
            routePattern === docsFileRoutePattern
              ? []
              : fileUrls.map((fileUrl) => ({
                  pathname: toPagePathname(
                    relative(distDirPath, fileURLToPath(fileUrl)),
                  ),
                  routePattern,
                })),
          ),
          sourceDocIndex,
        );
        if (shadowedDocsError) throw new Error(shadowedDocsError);

        const pagesBrokenLinks: TPageBrokenLinks[] = [];
        const htmlFileUrls = assets.get(STARLIGHT_DOC_ROUTE);
        if (!htmlFileUrls) {
          throw new Error(
            `[astro-local-links] Starlight's doc route (${STARLIGHT_DOC_ROUTE}) was not found ` +
              `among the built routes (${[...assets.keys()].join(", ")}). ` +
              `Is Starlight in \`integrations\`?`,
          );
        }
        // Starlight with `prerender: false` keeps the route but writes no HTML to check
        const docRoutePagePathCount = [...sourceDocIndex.keys()].filter(
          (pagePath) => pagePath !== STARLIGHT_404_PAGE_PATH,
        ).length;
        if (htmlFileUrls.length === 0 && docRoutePagePathCount > 0) {
          throw new Error(
            `[astro-local-links] Starlight wrote no doc pages, but ${settings.site.docsDirPath} has ` +
              `${docRoutePagePathCount} source docs. Server-rendered Starlight (\`prerender: false\`) ` +
              `isn't supported. If every source doc is a draft, this error is a false alarm.`,
          );
        }
        await Promise.all(
          htmlFileUrls.map(async (htmlFileUrl) => {
            const htmlFilePath = fileURLToPath(htmlFileUrl);
            const html = await readFile(htmlFilePath, "utf-8");
            const processedPage = processDocPage(
              toPagePathname(relative(distDirPath, htmlFilePath)),
              html,
              // a file target counts if it's in the output dir, which holds public/ files,
              // served docs files and whatever other integrations wrote
              { ...settings, servedFilesDirPath: distDirPath },
              sourceDocIndex,
            );

            if (processedPage.html !== html) {
              await writeFile(htmlFilePath, processedPage.html, "utf-8");
            }
            if (processedPage.pageBrokenLinks) {
              pagesBrokenLinks.push(processedPage.pageBrokenLinks);
            }
          }),
        );

        if (pagesBrokenLinks.length > 0) {
          throw new Error(formatBrokenLinksError(pagesBrokenLinks));
        }
      },
    },
  };
}

/** `guide/intro/index.html` → `/guide/intro/`, `guide/intro.html` → `/guide/intro`. */
function toPagePathname(distRelativeFilePath: string): string {
  const posixFilePath = distRelativeFilePath.split("\\").join("/");
  return (
    "/" +
    posixFilePath.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "")
  );
}

/**
 * Where `dev-middleware` lives next to this file: `.ts` in this repo, or a separate build
 * entry in `dist/` reached from either this plugin's own entry or the root entry's chunk.
 */
function devMiddlewareUrl(): URL {
  const currentFilePath = fileURLToPath(import.meta.url);
  if (currentFilePath.endsWith(".ts")) {
    return new URL("./dev-middleware.ts", import.meta.url);
  }
  if (currentFilePath.endsWith("astro-local-links.js")) {
    return new URL("./astro-local-links/dev-middleware.js", import.meta.url);
  }
  return new URL(
    "./plugins/astro-local-links/dev-middleware.js",
    import.meta.url,
  );
}
