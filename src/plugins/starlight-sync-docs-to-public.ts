/**
 * Astro/Starlight plugin that syncs a source docs directory to the public directory.
 *
 * Runs once at build start, and in dev mode watches the source directory for
 * changes and incrementally syncs files — no full directory deletion/recreation.
 */
import type { HookParameters } from "@astrojs/starlight/types";
import type { ViteDevServer } from "vite";
import { cp, mkdir, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { minimatch } from "minimatch";
import { parseFrontmatter } from "./utils/sidebar-builder-utils.js";

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
}

const DEFAULT_SRC_DIR = "src/content/docs";
const DEFAULT_PUBLIC_DIR = "public";

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

  // Delete all directories in publicDir except preserveDirs
  const items = await readdir(publicDir);
  for (const item of items) {
    const itemPath = resolve(publicDir, item);

    // Skip if item was deleted between readdir and now (race condition)
    let itemStat;
    try {
      itemStat = await stat(itemPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        continue;
      }
      throw err;
    }

    if (preserveDirs.includes(item) || !itemStat.isDirectory()) {
      continue;
    }

    await rm(itemPath, { recursive: true, force: true });
  }

  // Copy entire directory tree with filtering
  await copyWithRetry(srcDir, publicDir, ignorePatterns);
  console.log(
    `[starlight-sync-docs-to-public] Synced ${DEFAULT_SRC_DIR}/ → ${DEFAULT_PUBLIC_DIR}/ (full sync)`,
  );
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

  // Check if file should be filtered out
  if (ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))) {
    return;
  }

  // Skip draft markdown files
  if (changedFilePath.endsWith(".md") || changedFilePath.endsWith(".mdx")) {
    try {
      const frontmatter = parseFrontmatter(changedFilePath);
      if (frontmatter.draft === true) return;
    } catch {
      return;
    }
  }

  const destPath = resolve(publicDir, rel);

  // Check if source exists
  let srcStat;
  try {
    srcStat = await stat(changedFilePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      // File was deleted, remove from public
      await rm(destPath, { recursive: true, force: true });
      return;
    }
    throw err;
  }

  if (srcStat.isDirectory()) {
    // Create directory and copy contents recursively
    await mkdir(destPath, { recursive: true });
    const files = await readdir(changedFilePath);
    for (const file of files) {
      await incrementalSync(
        resolve(changedFilePath, file),
        srcDir,
        publicDir,
        ignorePatterns,
      );
    }
  } else {
    // Copy file: read source and write to destination
    // This avoids chmod/permission issues from cp()
    await mkdir(resolve(destPath, ".."), { recursive: true });
    const content = await readFile(changedFilePath);
    await writeFile(destPath, content);
  }

  console.log(
    `[starlight-sync-docs-to-public] Synced ${rel}`,
  );
}

/**
 * Helper to retry cp with backoff for race conditions.
 */
async function copyWithRetry(
  srcDir: string,
  publicDir: string,
  ignorePatterns: string[],
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await cp(srcDir, publicDir, {
        recursive: true,
        force: true,
        filter: (src) => {
          const rel = relative(srcDir, src);
          // Always allow the root itself
          if (rel === "") return true;
          // Apply ignore patterns
          if (
            ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))
          ) {
            return false;
          }
          // Skip markdown files with draft: true in frontmatter
          if (src.endsWith(".md") || src.endsWith(".mdx")) {
            try {
              const frontmatter = parseFrontmatter(src);
              if (frontmatter.draft === true) return false;
            } catch {
              return false;
            }
          }
          return true;
        },
      });
      return;
    } catch (err) {
      lastError = err as Error;
      const code = (err as NodeJS.ErrnoException)?.code;
      const isRaceCondition = code === "EEXIST" || code === "ENOENT";

      if (!isRaceCondition) {
        throw err;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  }

  if (lastError) {
    const code = (lastError as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST" || code === "ENOENT") {
      return;
    }
    throw lastError;
  }
}

export function starlightSyncDocsToPublic(options: SyncDocsToPublicOptions) {
  const srcDir = resolve(DEFAULT_SRC_DIR);
  const publicDir = resolve(DEFAULT_PUBLIC_DIR);
  const { preserveDirs, ignorePatterns = [] } = options;

  return {
    name: "starlight-sync-docs-to-public",
    hooks: {
      "config:setup": (hook: HookParameters<"config:setup">) => {
        hook.addIntegration({
          name: "astro-sync-docs-to-public",
          hooks: {
            "astro:build:start": async () => {
              await fullSync(srcDir, publicDir, preserveDirs, ignorePatterns);
            },
            "astro:server:setup": ({ server }: { server: ViteDevServer }) => {
              // Lock to prevent concurrent sync operations
              let isSyncing = false;
              let needsResync = false;
              let lastChangedFile: string | undefined;

              const performSync = async () => {
                if (isSyncing) {
                  needsResync = true;
                  return;
                }

                isSyncing = true;
                try {
                  if (lastChangedFile) {
                    // Incremental sync for file changes
                    await incrementalSync(
                      lastChangedFile,
                      srcDir,
                      publicDir,
                      ignorePatterns,
                    );
                  }
                  // If another change occurred during sync, resync
                  if (needsResync) {
                    needsResync = false;
                    lastChangedFile = undefined;
                    await performSync();
                  }
                } catch (err) {
                  console.error(err);
                } finally {
                  isSyncing = false;
                }
              };

              // Full sync on dev server start
              fullSync(srcDir, publicDir, preserveDirs, ignorePatterns).catch(
                console.error,
              );

              // Debounce to avoid concurrent syncs when multiple watcher
              // events fire rapidly for a single file change
              let debounceTimer: ReturnType<typeof setTimeout> | null = null;

              // Watch src directory for any changes and incrementally sync
              server.watcher.add(srcDir);
              server.watcher.on("all", (_event: string, filePath: string) => {
                if (!filePath.startsWith(srcDir)) return;
                lastChangedFile = filePath;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                  performSync();
                }, 100);
              });
            },
          },
        });
      },
    },
  };
}
