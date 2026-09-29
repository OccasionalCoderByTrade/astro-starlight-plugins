import fs from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { resolveDebugOutput, type DebugOptions } from "./debug-output.js";
import { createLedger, type TexDiagramLedger } from "./ledger.js";
import {
  latexCompileTransformer,
  type LatexCompileState,
} from "./transformer.js";

export type { DebugOptions as LatexCompileDebugOptions };

const js = String.raw;
const DARK_MODE_ROTATE = "178deg";

const INJECTED_CSS = `
:root {
  --cannoli-error-low: hsl(0, 70%, 94%);
  --cannoli-error: hsl(0, 72%, 42%);
  --cannoli-error-high: hsl(0, 72%, 28%);
}
[data-theme="dark"] {
  --cannoli-error-low: hsl(0, 55%, 16%);
  --cannoli-error: hsl(0, 75%, 60%);
  --cannoli-error-high: hsl(0, 80%, 82%);
}
.tex-compiled {
  background-color: transparent;
}
html[data-theme="dark"] .tex-compiled {
  filter: invert(1) hue-rotate(${DARK_MODE_ROTATE});
}
`;

export interface LatexCompileOptions {
  /**
   * Directory where SVG files should be written.
   * Resolved against the project root. Must be a subdirectory of Astro's
   * `publicDir`; image URLs are derived from its path relative to `publicDir`,
   * prefixed with `base`.
   */
  svgOutputDir: string;
  /**
   * Default CSS class(es) applied to every compiled SVG `<img>` element.
   * Individual blocks can override this with a `class` meta tag value.
   * The `tex-compiled` class is always present and cannot be overridden.
   */
  svgClassname?: string;
  /**
   * Directories added to the TeX input search path via TEXINPUTS, allowing
   * \input{} and \include{} to resolve files from your project. Use a trailing
   * slash for the directory itself, or double trailing slash for recursive
   * search (e.g. "src/latex/" or "src/latex//").
   */
  texInputDirs?: string[];
  /**
   * When set, a debug tex diagram image (a JPEG copy of each compiled tex
   * diagram) is written to a flat directory. Only blocks that carry a
   * `blockid=<n>` meta tag produce one; if several blocks in a doc share a
   * `blockid`, only the last one's is kept. Filename format: `<originating-file>--<blockid>-<8-char-dir-checksum>.jpg`,
   * where the checksum namespaces files originating from different
   * directories to avoid collisions between files with the same name.
   * Both paths live under the integration's codegen dir,
   * `.astro/integrations/astro-latex-compile/`. Images are deleted when their
   * block is removed or its content changes, and all are cleared at the start
   * of a build. Intended for local inspection, not for publishing.
   */
  debug?: true | DebugOptions;
  /**
   * When `true`, SVG files in `svgOutputDir` that are no longer referenced by
   * any `tex compile` block (orphaned tex diagrams) are deleted automatically.
   * On build, every orphaned tex diagram is swept at the end. In dev, docs that
   * weren't edited aren't re-rendered, so only compiled tex diagrams first
   * written during the current dev session are deleted when a block is edited;
   * older orphaned tex diagrams wait for the next build.
   * @default false
   */
  removeOrphanedSvgs?: boolean;
}

const DATA_STORE_FILE = "data-store.json";

function getDataStoreFile(config: AstroConfig): URL {
  return new URL(DATA_STORE_FILE, config.cacheDir);
}

/**
 * Resolves `svgOutputDir` against the project root and returns it along with
 * the URL path it is served from, e.g. `/docs/static/tex-svgs` for
 * `public/static/tex-svgs` with `base: "/docs"`. Throws unless it is a
 * subdirectory of `publicDir`.
 */
function resolveSvgOutput(
  config: AstroConfig,
  svgOutputDir: string,
): { dir: string; urlPrefix: string } {
  const publicDir = fileURLToPath(config.publicDir);
  const dir = resolve(fileURLToPath(config.root), svgOutputDir);
  const rel = relative(publicDir, dir);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    throw new Error(
      `[astro-latex-compile] svgOutputDir "${svgOutputDir}" must be a subdirectory of publicDir "${publicDir}".`,
    );
  }
  const base = config.base.replace(/\/+$/, "");
  return { dir, urlPrefix: `${base}/${rel.split(sep).join("/")}` };
}

async function clearContentLayerCache(config: AstroConfig): Promise<void> {
  const dataStore = getDataStoreFile(config);
  if (fs.existsSync(dataStore)) {
    await fs.promises.rm(dataStore, { force: true });
  }
}

export function astroLatexCompile(
  options: LatexCompileOptions,
): AstroIntegration {
  const missingTools = new Set<string>();
  let ledger: TexDiagramLedger | undefined;

  return {
    name: "astro-latex-compile",
    hooks: {
      "astro:config:setup": async ({
        command,
        config,
        updateConfig,
        injectScript,
        createCodegenDir,
      }) => {
        const svgOutput = resolveSvgOutput(config, options.svgOutputDir);
        const debug = options.debug
          ? resolveDebugOutput(fileURLToPath(createCodegenDir()), options.debug)
          : undefined;
        if (command !== "build" && command !== "dev") return;

        injectScript(
          "page",
          js`{ const s = document.createElement("style"); s.textContent = ${JSON.stringify(INJECTED_CSS)}; document.head.appendChild(s); }`,
        );

        if (command === "build") {
          await clearContentLayerCache(config);
        }

        if (debug) {
          const root = fileURLToPath(config.root);
          console.log(
            `[astro-latex-compile] debug tex diagram images: ${relative(root, debug.outputDir)}`,
          );
        }

        ledger = createLedger({
          svgDir: svgOutput.dir,
          debugImageDir: debug?.outputDir,
          removeOrphanedSvgs: options.removeOrphanedSvgs ?? false,
          command,
        });
        await ledger.start();

        const existingPlugins = Array.isArray(config.markdown?.remarkPlugins)
          ? config.markdown.remarkPlugins.filter(Boolean)
          : [];

        const state: LatexCompileState = {
          svgUrlPrefix: svgOutput.urlPrefix,
          missingTools,
          exitOnMissingToolchain: command === "dev",
          ledger,
          debugLogFile: debug?.logFile,
        };

        updateConfig({
          markdown: {
            remarkPlugins: [
              ...existingPlugins,
              () => latexCompileTransformer(options, state),
            ],
          },
        });
      },

      "astro:build:done": async () => {
        // Starlight's content loader only logs errors thrown while rendering
        // markdown, so a missing toolchain has to fail the build from here.
        if (missingTools.size > 0) {
          throw new Error(
            `[astro-latex-compile] ${[...missingTools].join(" and ")} not found on PATH; tex compile blocks could not be compiled.`,
          );
        }

        await ledger?.sweep();
      },
    },
  };
}
