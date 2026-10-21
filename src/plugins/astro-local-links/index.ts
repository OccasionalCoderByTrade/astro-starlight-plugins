import type { AstroIntegration } from "astro";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceDocIndex,
  formatBrokenLinksError,
  formatPagePathCollisionsError,
  processDocPage,
  STARLIGHT_DOCS_ROUTE,
  SETTINGS_MODULE_ID,
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
            docsDirPath: fileURLToPath(new URL("content/docs/", config.srcDir)),
            publicDirPath: fileURLToPath(config.publicDir),
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

        if (command !== "dev" || (!settings.validate && !settings.normalize)) {
          return;
        }
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
                    ? `export default ${JSON.stringify(settings)};`
                    : undefined,
              },
            ],
          },
        });
        addMiddleware({ entrypoint: devMiddlewareUrl(), order: "post" });
      },

      "astro:build:done": async ({ dir, assets }) => {
        if (!settings.validate && !settings.normalize) return;

        const sourceDocIndex = buildSourceDocIndex(settings.site.docsDirPath);
        const pagePathCollisionsError =
          formatPagePathCollisionsError(sourceDocIndex);
        if (pagePathCollisionsError) throw new Error(pagePathCollisionsError);

        const pagesBrokenLinks: TPageBrokenLinks[] = [];
        const htmlFileUrls = assets.get(STARLIGHT_DOCS_ROUTE) ?? [];
        await Promise.all(
          htmlFileUrls.map(async (htmlFileUrl) => {
            const htmlFilePath = fileURLToPath(htmlFileUrl);
            const html = await readFile(htmlFilePath, "utf-8");
            const processedPage = processDocPage(
              toPagePathname(relative(fileURLToPath(dir), htmlFilePath)),
              html,
              settings,
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
