import fs from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { resolveDebugOutput, type DebugOptions } from "./debug-output.js";
import { createLedger, type TexDiagramLedger } from "./ledger.js";
import {
  findMissingTexInputDirs,
  hashTexInputs,
  listTexInputFiles,
  resolveTexInputDirs,
  type TexInputDir,
} from "./tex-inputs.js";
import {
  latexCompileTransformer,
  type LatexCompileState,
  type TexCompileErrorEntry,
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
  max-width: 100%;
  height: auto;
}
html[data-theme="dark"] .tex-compiled {
  filter: invert(1) hue-rotate(${DARK_MODE_ROTATE});
}
`;

export interface LatexCompileOptions {
  /**
   * Directory where SVG files should be written.
   * Resolved against the project root. Must be a subdirectory of Astro's
   * `publicDir`. Pages inline each compiled tex diagram, so these files act as
   * a cache keyed by hash.
   */
  svgOutputDir: string;
  /**
   * Default CSS class(es) applied to every compiled tex diagram's inline
   * `<svg>` element.
   * Individual blocks can override this with a `class` meta tag value.
   * The `tex-compiled` class is always present and cannot be overridden.
   */
  svgClassname?: string;
  /**
   * Tex input dirs: directories, resolved against the project root, that
   * `tex compile` blocks can pull tex input files from via `\input`,
   * `\include`, `\usepackage`, `\includegraphics` and similar. Use a trailing
   * slash for the directory itself, or double trailing slash for recursive
   * search (e.g. "src/latex/" or "src/latex//"). These are the only files
   * outside a block that it can read, and only by name: paths, absolute or
   * relative, don't resolve. Changing any tex input file recompiles
   * every compiled tex diagram; dotfiles and LaTeX build artifacts don't count.
   * A missing dir fails `astro dev` and only warns on `astro build`.
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
 * Resolves `svgOutputDir` against the project root. Throws unless it is a
 * subdirectory of `publicDir`.
 */
function resolveSvgOutputDir(
  config: AstroConfig,
  svgOutputDir: string,
): string {
  const publicDir = fileURLToPath(config.publicDir);
  const svgOutputDirPath = resolve(fileURLToPath(config.root), svgOutputDir);
  const publicRelativeSvgDir = relative(publicDir, svgOutputDirPath);
  if (
    publicRelativeSvgDir === "" ||
    publicRelativeSvgDir === ".." ||
    publicRelativeSvgDir.startsWith(`..${sep}`) ||
    isAbsolute(publicRelativeSvgDir)
  ) {
    throw new Error(
      `[astro-latex-compile] svgOutputDir "${svgOutputDir}" must be a subdirectory of publicDir "${publicDir}".`,
    );
  }
  return svgOutputDirPath;
}

async function clearContentLayerCache(config: AstroConfig): Promise<void> {
  const dataStore = getDataStoreFile(config);
  if (fs.existsSync(dataStore)) {
    await fs.promises.rm(dataStore, { force: true });
  }
}

/**
 * The message `astro:build:done` fails the build with, or `undefined` when
 * every `tex compile` block produced a compiled tex diagram. Each error's
 * full report was already logged when it happened, so this only indexes them.
 */
function buildFailureMessage(
  missingTools: Set<string>,
  missingTexInputDirs: TexInputDir[],
  texCompileErrors: TexCompileErrorEntry[],
): string | undefined {
  const lines: string[] = [];
  if (missingTools.size > 0) {
    const missingDirsHint =
      missingTexInputDirs.length > 0
        ? ` texInputDirs ${describeTexInputDirs(missingTexInputDirs)} were missing. If they hold files where the compiled tex diagrams were built, every diagram's hash differs here, so none were found.`
        : "";
    lines.push(
      `${[...missingTools].join(" and ")} not found on PATH; tex compile blocks could not be compiled.${missingDirsHint}`,
    );
  }
  if (texCompileErrors.length > 0) {
    lines.push(
      `${texCompileErrors.length} tex compile error${texCompileErrors.length === 1 ? "" : "s"}:`,
      ...texCompileErrors.map(
        ({ location, summary }) => `  - ${location}: ${summary}`,
      ),
    );
  }
  if (lines.length === 0) return undefined;
  return `[astro-latex-compile] ${lines.join("\n")}`;
}

function describeTexInputDirs(texInputDirs: TexInputDir[]): string {
  return texInputDirs
    .map((texInputDir) => `"${texInputDir.configuredPath}"`)
    .join(", ");
}

export function astroLatexCompile(
  options: LatexCompileOptions,
): AstroIntegration {
  const missingTools = new Set<string>();
  const texCompileErrors: TexCompileErrorEntry[] = [];
  let missingTexInputDirs: TexInputDir[] = [];
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
        addWatchFile,
      }) => {
        const svgOutputDirPath = resolveSvgOutputDir(
          config,
          options.svgOutputDir,
        );
        const debugOutput = options.debug
          ? resolveDebugOutput(fileURLToPath(createCodegenDir()), options.debug)
          : undefined;
        if (command !== "build" && command !== "dev") return;

        injectScript(
          "page",
          js`{ const styleElement = document.createElement("style"); styleElement.textContent = ${JSON.stringify(INJECTED_CSS)}; document.head.appendChild(styleElement); }`,
        );

        if (command === "build") {
          await clearContentLayerCache(config);
        }

        const rootDirPath = fileURLToPath(config.root);
        const texInputDirs = resolveTexInputDirs(
          rootDirPath,
          options.texInputDirs ?? [],
        );
        missingTexInputDirs = findMissingTexInputDirs(texInputDirs);
        if (missingTexInputDirs.length > 0) {
          const message = `[astro-latex-compile] texInputDirs ${describeTexInputDirs(missingTexInputDirs)} not found in "${rootDirPath}".`;
          // A prod build may be missing a dir that is empty on the dev
          // machine (git drops empty dirs) and still find every compiled tex
          // diagram, so only dev fails here.
          if (command === "dev") throw new Error(message);
          console.warn(message);
        }

        if (command === "dev") {
          // Restarts dev when a tex input file changes, which re-runs this hook
          // with a new texInputsHash below.
          for (const filePath of listTexInputFiles(texInputDirs)) {
            addWatchFile(filePath);
          }
        }

        if (debugOutput) {
          console.log(
            `[astro-latex-compile] debug tex diagram images: ${relative(rootDirPath, debugOutput.outputDir)}`,
          );
        }

        ledger = createLedger({
          svgDir: svgOutputDirPath,
          debugImageDir: debugOutput?.outputDir,
          removeOrphanedSvgs: options.removeOrphanedSvgs ?? false,
          command,
        });
        await ledger.start();

        const existingPlugins = Array.isArray(config.markdown?.remarkPlugins)
          ? config.markdown.remarkPlugins.filter(Boolean)
          : [];

        const state: LatexCompileState = {
          missingTools,
          texCompileErrors,
          exitOnMissingToolchain: command === "dev",
          ledger,
          debugLogFile: debugOutput?.logFile,
          rootDirPath,
          texInputDirs,
        };

        // Astro clears its content store when its config's JSON changes. The
        // plugin's options are part of that JSON, so carrying the hash here
        // makes docs cached before a tex input file changed render again.
        const texInputsHash = hashTexInputs(rootDirPath, texInputDirs);
        updateConfig({
          markdown: {
            remarkPlugins: [
              ...existingPlugins,
              [
                () => latexCompileTransformer(options, state),
                { texInputsHash },
              ],
            ],
          },
        });
      },

      "astro:build:done": async () => {
        // Astro's glob loader only logs errors thrown while rendering
        // markdown, so tex compile errors have to fail the build from here.
        // See docs/adr/0006-tex-compile-errors-fail-build-at-build-done.md.
        const failureMessage = buildFailureMessage(
          missingTools,
          missingTexInputDirs,
          texCompileErrors,
        );
        // Skips the sweep too: a failed block references no compiled tex
        // diagram, so sweeping would delete its last good one.
        if (failureMessage) throw new Error(failureMessage);

        await ledger?.sweep();
      },
    },
  };
}
