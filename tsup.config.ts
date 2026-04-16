import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar": "src/plugins/starlight-index-only-sidebar.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
    "plugins/remark-latex-compile": "src/plugins/remark-latex-compile/index.ts",
    "plugins/astro-normalize-paths": "src/plugins/astro-normalize-paths.ts",
    "plugins/starlight-sync-docs-to-public": "src/plugins/starlight-sync-docs-to-public.ts",
    "cli/cannoli-latex-cleanup": "scripts/cli/cannoli-latex-cleanup.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
