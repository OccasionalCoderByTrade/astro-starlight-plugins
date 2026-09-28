import fs from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import {
  latexCompileTransformer,
  type LatexCompileState,
} from "./transformer.js";

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
   * When set, a JPEG copy of each compiled diagram is written to a flat
   * directory. Only blocks that carry a `blockid=<n>` meta tag produce a
   * JPEG. Filename format: `<originating-file>-<8-char-dir-checksum>--<blockid>.jpg`,
   * where the checksum namespaces files originating from different
   * directories to avoid collisions between files with the same name.
   * JPEGs are deleted automatically when their block is removed or its content
   * changes. Intended for local inspection, not for publishing.
   */
  debug?: {
    /** Directory where debug JPEGs are written, as a flat file list. */
    outputDir: string;
    /** Path to a log file that records every JPEG (re)write. Rotates by size. */
    logFile: string;
  };
  /**
   * When `true`, SVG files in `svgOutputDir` that are no longer referenced by
   * any `tex compile` block are deleted automatically. In dev mode, stale SVGs
   * are removed immediately when a block is edited. On build, any remaining
   * orphans are swept at the end.
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
  const referencedHashes = new Set<string>();
  const fileHashMap = new Map<string, Set<string>>();
  const fileJpgPathMap = new Map<string, Set<string>>();
  let svgOutput: { dir: string; urlPrefix: string } | undefined;

  return {
    name: "astro-latex-compile",
    hooks: {
      "astro:config:setup": async ({
        command,
        config,
        updateConfig,
        injectScript,
      }) => {
        svgOutput = resolveSvgOutput(config, options.svgOutputDir);
        if (command !== "build" && command !== "dev") return;

        injectScript(
          "page",
          js`{ const s = document.createElement("style"); s.textContent = ${JSON.stringify(INJECTED_CSS)}; document.head.appendChild(s); }`,
        );

        if (command === "build") {
          await clearContentLayerCache(config);
        }

        if (command === "dev" && options.debug) {
          const debugOutputDir = resolve(options.debug.outputDir);
          let entries: string[];
          try {
            entries = await readdir(debugOutputDir);
          } catch {
            entries = [];
          }
          await Promise.all(
            entries
              .filter((f) => f.endsWith(".jpg"))
              .map((f) => rm(join(debugOutputDir, f), { force: true })),
          );
        }

        const existingPlugins = Array.isArray(config.markdown?.remarkPlugins)
          ? config.markdown.remarkPlugins.filter(Boolean)
          : [];

        const state: LatexCompileState = {
          svgOutputDir: svgOutput.dir,
          svgUrlPrefix: svgOutput.urlPrefix,
          fileHashMap: options.removeOrphanedSvgs ? fileHashMap : undefined,
          referencedHashes:
            command === "build" && options.removeOrphanedSvgs
              ? referencedHashes
              : undefined,
          fileJpgPathMap: options.debug ? fileJpgPathMap : undefined,
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
        if (!options.removeOrphanedSvgs || !svgOutput) return;

        const svgDir = svgOutput.dir;
        let entries: string[];
        try {
          entries = await readdir(svgDir);
        } catch {
          return; // directory doesn't exist, nothing to clean
        }

        const orphans = entries.filter(
          (f) => f.endsWith(".svg") && !referencedHashes.has(f.slice(0, -4)),
        );

        await Promise.all(
          orphans.map((f) => rm(join(svgDir, f), { force: true })),
        );

        if (orphans.length > 0) {
          console.log(
            `[astro-latex-compile] Removed ${orphans.length} orphaned SVG${orphans.length === 1 ? "" : "s"}.`,
          );
        }
      },
    },
  };
}
