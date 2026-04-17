import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar":
      "src/plugins/starlight-index-only-sidebar/index.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
    "plugins/astro-latex-compile": "src/plugins/astro-latex-compile/index.ts",
    "plugins/astro-normalize-paths": "src/plugins/astro-normalize-paths.ts",
    "plugins/astro-sync-docs-to-public":
      "src/plugins/astro-sync-docs-to-public/index.ts",
    "plugins/astro-sync-docs-to-public/page-script":
      "src/plugins/astro-sync-docs-to-public/page-script.ts",
    "cli/cannoli-latex-cleanup": "scripts/cli/cannoli-latex-cleanup.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
