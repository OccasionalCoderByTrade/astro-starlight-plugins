/**
 * Astro integration that syncs a source docs directory to the public directory.
 *
 * Runs once at build start, and in dev mode watches the source directory for
 * changes and incrementally syncs files — no full directory deletion/recreation.
 */
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { ViteDevServer } from "vite";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { minimatch } from "minimatch";
import { parseFrontmatter } from "../utils/workspace-utils.js";

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

export interface SyncDocsToPublicOptions {
  /**
   * Names of child directories inside public/ to preserve during sync.
   * These directories will not be modified during re-syncing.
   */
  preserveDirs: string[];
  /**
   * Glob patterns for files to exclude from syncing.
   * Patterns are matched against paths relative to src/content/docs/.
   * Example: ["*.txt", "drafts/"]
   */
  ignorePatterns?: string[];
  /**
   * When true, injects a client-side script that runs on every page in both
   * dev and build modes.
   */
  exposePageSrcButton?: boolean;
}

const DEFAULT_SRC_DIR = "src/content/docs";
const DEFAULT_PUBLIC_DIR = "public";

function validateOptions(options: SyncDocsToPublicOptions): void {
  const mdProbePaths = ["test.md", "test.mdx", "foo/test.md", "foo/test.mdx"];

  if (!options.exposePageSrcButton) return;

  const offendingMdPatterns = (options.ignorePatterns ?? []).filter((pattern) =>
    mdProbePaths.some((probe) => minimatch(probe, pattern, { dot: true })),
  );

  const offendingMtPatternsStr = offendingMdPatterns
    .map((p) => `    - "${p}"`)
    .join("\n");

  if (offendingMdPatterns.length > 0) {
    throw new Error(
      `The 'exposePageSrcButton' option is enabled but the following 'ignorePatterns' values conflict with it: \n${offendingMtPatternsStr}\n\n` +
        `Since these ignore patterns match md/mdx files, the page source button would break. Either disable 'exposePageSrcButton' or remove these patterns.`,
    );
  }
}

/**
 * Full sync: delete non-preserved dirs and copy everything.
 * Only called on initial startup and build.
 */
async function fullSync(
  srcDir: string,
  publicDir: string,
  preserveDirs: string[],
  ignorePatterns: string[],
): Promise<void> {
  await mkdir(publicDir, { recursive: true });

  const items = await readdir(publicDir, { withFileTypes: true });
  await Promise.all(
    items
      .filter((item) => item.isDirectory() && !preserveDirs.includes(item.name))
      .map((item) =>
        rm(resolve(publicDir, item.name), { recursive: true, force: true }),
      ),
  );

  await copyAll(srcDir, srcDir, publicDir, ignorePatterns);
  console.log(
    `[starlight-sync-docs-to-public] Synced ${DEFAULT_SRC_DIR}/ → ${DEFAULT_PUBLIC_DIR}/ (full sync)`,
  );
}

function isMdFile(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".mdx");
}

function getDestPath(
  srcFilePath: string,
  srcDir: string,
  publicDir: string,
): string {
  return resolve(publicDir, relative(srcDir, srcFilePath));
}

/**
 * Copies a single md/mdx file to its remapped destination in public.
 */
async function copyMdFile(
  srcFilePath: string,
  srcDir: string,
  publicDir: string,
): Promise<void> {
  const destPath = getDestPath(srcFilePath, srcDir, publicDir);
  await mkdir(dirname(destPath), { recursive: true });
  const content = await readFile(srcFilePath);
  await writeFile(destPath, content);
}

/**
 * Incremental sync: copy a single changed file or directory.
 * Called when a file changes in dev mode.
 */
async function incrementalSync(
  changedFilePath: string,
  srcDir: string,
  publicDir: string,
  ignorePatterns: string[],
): Promise<void> {
  const rel = relative(srcDir, changedFilePath);

  if (
    ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))
  ) {
    return;
  }

  let srcStat;
  try {
    srcStat = await stat(changedFilePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      const deletePath = getDestPath(changedFilePath, srcDir, publicDir);
      await rm(deletePath, { recursive: true, force: true });
      return;
    }
    throw err;
  }

  if (srcStat.isDirectory()) {
    await mkdir(resolve(publicDir, rel), { recursive: true });
    const files = await readdir(changedFilePath);
    await Promise.all(
      files.map((file) =>
        incrementalSync(
          resolve(changedFilePath, file),
          srcDir,
          publicDir,
          ignorePatterns,
        ),
      ),
    );
  } else if (isMdFile(changedFilePath)) {
    try {
      const frontmatter = parseFrontmatter(changedFilePath);
      if (frontmatter.draft === true) return;
    } catch {
      return;
    }
    await copyMdFile(changedFilePath, srcDir, publicDir);
  } else {
    const destPath = resolve(publicDir, rel);
    await mkdir(dirname(destPath), { recursive: true });
    const content = await readFile(changedFilePath);
    await writeFile(destPath, content);
  }

  console.log(`[starlight-sync-docs-to-public] Synced ${rel}`);
}

/**
 * Recursively copies srcDir into publicDir, applying ignore/draft filters
 * and remapping non-index md/mdx files to their nested index path.
 */
async function copyAll(
  currentSrc: string,
  srcDir: string,
  publicDir: string,
  ignorePatterns: string[],
): Promise<void> {
  const entries = await readdir(currentSrc, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = resolve(currentSrc, entry.name);
      const rel = relative(srcDir, srcPath);

      if (
        ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))
      ) {
        return;
      }

      if (entry.isDirectory()) {
        await copyAll(srcPath, srcDir, publicDir, ignorePatterns);
      } else if (isMdFile(srcPath)) {
        try {
          const frontmatter = parseFrontmatter(srcPath);
          if (frontmatter.draft === true) return;
        } catch {
          return;
        }
        await copyMdFile(srcPath, srcDir, publicDir);
      } else {
        const destPath = resolve(publicDir, rel);
        await mkdir(dirname(destPath), { recursive: true });
        const content = await readFile(srcPath);
        await writeFile(destPath, content);
      }
    }),
  );
}

export function syncDocsToPublic(
  options: SyncDocsToPublicOptions,
): AstroIntegration {
  const srcDir = resolve(DEFAULT_SRC_DIR);
  const publicDir = resolve(DEFAULT_PUBLIC_DIR);
  const {
    preserveDirs: rawPreserveDirs,
    ignorePatterns = [],
    exposePageSrcButton = false,
  } = options;
  const preserveDirs = rawPreserveDirs.map((d) => d.replace(/\/+$/, ""));

  return {
    name: "astro-sync-docs-to-public",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        validateOptions(options);
        if (exposePageSrcButton) {
          injectScript(
            "page",
            `
            const s = document.createElement('style');
            s.textContent = ${JSON.stringify(pageSrcStyles)};
            document.head.appendChild(s);
          `,
          );
          // Three contexts require three different paths to page-script.js:
          // 1. Local dev (.ts source): page-script.ts lives alongside index.ts
          // 2. Dist, own entry (dist/plugins/astro-sync-docs-to-public.js): page-script is one level deeper
          // 3. Dist, bundled into another entry (e.g. dist/index.js via re-export): must prefix with plugins/
          const currentFile = fileURLToPath(import.meta.url);
          let pageScriptUrl: URL;
          if (currentFile.endsWith(".ts")) {
            pageScriptUrl = new URL("./page-script.ts", import.meta.url);
          } else if (currentFile.endsWith("astro-sync-docs-to-public.js")) {
            pageScriptUrl = new URL(
              "./astro-sync-docs-to-public/page-script.js",
              import.meta.url,
            );
          } else {
            pageScriptUrl = new URL(
              "./plugins/astro-sync-docs-to-public/page-script.js",
              import.meta.url,
            );
          }
          const scriptPath = fileURLToPath(pageScriptUrl);
          injectScript("page", `import ${JSON.stringify(scriptPath)};`);
        }
      },

      "astro:build:start": async () => {
        await fullSync(srcDir, publicDir, preserveDirs, ignorePatterns);
      },

      "astro:server:setup": ({ server }: { server: ViteDevServer }) => {
        const pendingPaths = new Set<string>();
        let isSyncing = false;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const performSync = async () => {
          if (isSyncing) return;
          isSyncing = true;
          try {
            while (pendingPaths.size > 0) {
              const paths = [...pendingPaths];
              pendingPaths.clear();
              await Promise.all(
                paths.map((p) =>
                  incrementalSync(p, srcDir, publicDir, ignorePatterns).catch(
                    (err) => {
                      console.error(
                        `[starlight-sync-docs-to-public] Error syncing ${p}:`,
                        err,
                      );
                    },
                  ),
                ),
              );
            }
          } finally {
            isSyncing = false;
            // Paths that arrived between the last while-check and isSyncing=false
            if (pendingPaths.size > 0) void performSync();
          }
        };

        fullSync(srcDir, publicDir, preserveDirs, ignorePatterns).catch(
          console.error,
        );

        server.watcher.add(srcDir);
        server.watcher.on("all", (_event: string, filePath: string) => {
          if (!filePath.startsWith(srcDir)) return;
          pendingPaths.add(filePath);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(performSync, 100);
        });
      },
    },
  };
}
