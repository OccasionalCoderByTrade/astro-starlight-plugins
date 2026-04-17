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
import { parseFrontmatter } from "../utils/sidebar-builder-utils.js";

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
    preserveDirs,
    ignorePatterns = [],
    exposePageSrcButton = false,
  } = options;

  return {
    name: "astro-sync-docs-to-public",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        validateOptions(options);
        if (exposePageSrcButton) {
          // Three contexts require three different paths to page-script.js:
          // 1. Local dev (.ts source): page-script.ts lives alongside index.ts
          // 2. Dist, own entry (dist/plugins/astro-sync-docs-to-public.js): page-script is one level deeper
          // 3. Dist, bundled into another entry (e.g. dist/index.js via re-export): must prefix with plugins/
          const currentFile = fileURLToPath(import.meta.url);
          const scriptPath = fileURLToPath(
            currentFile.endsWith(".ts")
              ? new URL("./page-script.ts", import.meta.url)
              : currentFile.endsWith("astro-sync-docs-to-public.js")
                ? new URL(
                    "./astro-sync-docs-to-public/page-script.js",
                    import.meta.url,
                  )
                : new URL(
                    "./plugins/astro-sync-docs-to-public/page-script.js",
                    import.meta.url,
                  ),
          );
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

/** @deprecated Use {@link syncDocsToPublic} instead. */
export const starlightSyncDocsToPublic = syncDocsToPublic;
