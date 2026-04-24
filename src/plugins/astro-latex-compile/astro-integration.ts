import fs from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AstroConfig, AstroIntegration } from "astro";
import { remarkLatexCompile, type RemarkLatexCompileOptions } from "./index.js";

export interface LatexCompileOptions extends RemarkLatexCompileOptions {
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

  return {
    name: "astro-latex-compile",
    hooks: {
      "astro:config:setup": async ({ command, config, updateConfig }) => {
        if (command !== "build" && command !== "dev") return;

        if (command === "build") {
          await clearContentLayerCache(config);
        }

        const existingPlugins = Array.isArray(config.markdown?.remarkPlugins)
          ? config.markdown.remarkPlugins.filter(Boolean)
          : [];

        const remarkOptions: RemarkLatexCompileOptions = {
          ...options,
          _fileHashMap: options.removeOrphanedSvgs ? fileHashMap : undefined,
          _referencedHashes:
            command === "build" && options.removeOrphanedSvgs
              ? referencedHashes
              : undefined,
        };

        updateConfig({
          markdown: {
            remarkPlugins: [
              ...existingPlugins,
              [remarkLatexCompile, remarkOptions],
            ],
          },
        });
      },

      "astro:build:done": async () => {
        if (!options.removeOrphanedSvgs) return;

        const svgDir = resolve(options.svgOutputDir);
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
