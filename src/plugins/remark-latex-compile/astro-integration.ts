import fs from "node:fs";
import type { AstroConfig, AstroIntegration } from "astro";
import remarkLatexCompile, { type RemarkLatexCompileOptions } from "./index.js";

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

export function latexCompile(
  options: RemarkLatexCompileOptions,
): AstroIntegration {
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

        updateConfig({
          markdown: {
            remarkPlugins: [...existingPlugins, [remarkLatexCompile, options]],
          },
        });
      },
    },
  };
}
