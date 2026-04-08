/**
 * Astro/Starlight plugin that syncs a source docs directory to the public directory.
 *
 * Runs once at build start, and in dev mode watches the source directory for
 * changes and re-syncs automatically — no need to restart the dev server.
 */
import type { HookParameters } from "@astrojs/starlight/types";
import type { ViteDevServer } from "vite";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
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

async function syncDirs(
  srcDir: string,
  publicDir: string,
  preserveDirs: string[],
  ignorePatterns: string[],
  changedFile?: string,
): Promise<void> {
  await mkdir(publicDir, { recursive: true });

  // Delete all directories in publicDir except preserveDirs
  const items = await readdir(publicDir);
  for (const item of items) {
    const itemPath = resolve(publicDir, item);
    const itemStat = await stat(itemPath);

    if (preserveDirs.includes(item) || !itemStat.isDirectory()) {
      continue;
    }

    await rm(itemPath, { recursive: true, force: true });
  }

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
        const frontmatter = parseFrontmatter(src);
        if (frontmatter.draft === true) return false;
      }
      return true;
    },
  });

  const fileInfo = changedFile
    ? ` (changed: ${changedFile.replace(srcDir + "/", "")})`
    : "";
  console.log(
    `[starlight-sync-docs-to-public] Synced ${DEFAULT_SRC_DIR}/ → ${DEFAULT_PUBLIC_DIR}/ ${fileInfo}`,
  );
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
              await syncDirs(srcDir, publicDir, preserveDirs, ignorePatterns);
            },
            "astro:server:setup": ({ server }: { server: ViteDevServer }) => {
              // Initial sync on dev server start
              syncDirs(srcDir, publicDir, preserveDirs, ignorePatterns).catch(
                console.error,
              );

              // Debounce to avoid concurrent syncs when multiple watcher
              // events fire rapidly for a single file change
              let debounceTimer: ReturnType<typeof setTimeout> | null = null;
              let lastChangedFile: string | undefined;

              // Watch src directory for any changes and re-sync
              server.watcher.add(srcDir);
              server.watcher.on("all", (_event: string, filePath: string) => {
                if (!filePath.startsWith(srcDir)) return;
                lastChangedFile = filePath;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                  syncDirs(
                    srcDir,
                    publicDir,
                    preserveDirs,
                    ignorePatterns,
                    lastChangedFile,
                  ).catch(console.error);
                }, 100);
              });
            },
          },
        });
      },
    },
  };
}
