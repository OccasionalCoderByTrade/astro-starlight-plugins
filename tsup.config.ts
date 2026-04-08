import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar": "src/plugins/starlight-index-only-sidebar.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
    "plugins/remark-latex-compile": "src/plugins/remark-latex-compile/index.ts",
    "plugins/starlight-latex-compile": "src/plugins/remark-latex-compile/starlight-plugin.ts",
    "cli/cannoli-latex-cleanup": "scripts/cli/cannoli-latex-cleanup.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
