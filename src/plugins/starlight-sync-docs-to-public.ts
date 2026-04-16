/**
 * Astro integration that syncs a source docs directory to the public directory.
 *
 * Runs once at build start, and in dev mode watches the source directory for
 * changes and incrementally syncs files — no full directory deletion/recreation.
 */
import type { AstroIntegration } from "astro";
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

  const items = await readdir(publicDir, { withFileTypes: true });
  await Promise.all(
    items
      .filter((item) => item.isDirectory() && !preserveDirs.includes(item.name))
      .map((item) => rm(resolve(publicDir, item.name), { recursive: true, force: true })),
  );

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

  if (ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))) {
    return;
  }

  if (changedFilePath.endsWith(".md") || changedFilePath.endsWith(".mdx")) {
    try {
      const frontmatter = parseFrontmatter(changedFilePath);
      if (frontmatter.draft === true) return;
    } catch {
      return;
    }
  }

  const destPath = resolve(publicDir, rel);

  let srcStat;
  try {
    srcStat = await stat(changedFilePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      await rm(destPath, { recursive: true, force: true });
      return;
    }
    throw err;
  }

  if (srcStat.isDirectory()) {
    await mkdir(destPath, { recursive: true });
    const files = await readdir(changedFilePath);
    await Promise.all(
      files.map((file) =>
        incrementalSync(resolve(changedFilePath, file), srcDir, publicDir, ignorePatterns),
      ),
    );
  } else {
    await mkdir(resolve(destPath, ".."), { recursive: true });
    const content = await readFile(changedFilePath);
    await writeFile(destPath, content);
  }

  console.log(`[starlight-sync-docs-to-public] Synced ${rel}`);
}

async function copyWithRetry(
  srcDir: string,
  publicDir: string,
  ignorePatterns: string[],
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await cp(srcDir, publicDir, {
        recursive: true,
        force: true,
        filter: (src) => {
          const rel = relative(srcDir, src);
          if (rel === "") return true;
          if (ignorePatterns.some((pattern) => minimatch(rel, pattern, { dot: true }))) {
            return false;
          }
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
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST" && code !== "ENOENT") throw err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
    }
  }
  // All 3 attempts hit benign race condition errors (EEXIST/ENOENT) — treat as success
}

export function syncDocsToPublic(options: SyncDocsToPublicOptions): AstroIntegration {
  const srcDir = resolve(DEFAULT_SRC_DIR);
  const publicDir = resolve(DEFAULT_PUBLIC_DIR);
  const { preserveDirs, ignorePatterns = [] } = options;

  return {
    name: "astro-sync-docs-to-public",
    hooks: {
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
                  incrementalSync(p, srcDir, publicDir, ignorePatterns).catch((err) => {
                    console.error(`[starlight-sync-docs-to-public] Error syncing ${p}:`, err);
                  }),
                ),
              );
            }
          } finally {
            isSyncing = false;
            // Paths that arrived between the last while-check and isSyncing=false
            if (pendingPaths.size > 0) void performSync();
          }
        };

        fullSync(srcDir, publicDir, preserveDirs, ignorePatterns).catch(console.error);

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
