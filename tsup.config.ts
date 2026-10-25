import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar":
      "src/plugins/starlight-index-only-sidebar/index.ts",
    "plugins/starlight-index-sourced-sidebar":
      "src/plugins/starlight-index-sourced-sidebar/index.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
    "plugins/astro-vscode-heading-ids":
      "src/plugins/astro-vscode-heading-ids/index.ts",
    "plugins/astro-latex-compile": "src/plugins/astro-latex-compile/index.ts",
    "plugins/astro-normalize-paths":
      "src/plugins/astro-normalize-paths/index.ts",
    "plugins/astro-local-links": "src/plugins/astro-local-links/index.ts",
    "plugins/astro-local-links/dev-middleware":
      "src/plugins/astro-local-links/dev-middleware.ts",
    "plugins/astro-serve-docs-files":
      "src/plugins/astro-serve-docs-files/index.ts",
    "plugins/astro-serve-docs-files/page-script":
      "src/plugins/astro-serve-docs-files/page-script.ts",
    "plugins/astro-serve-docs-files/route":
      "src/plugins/astro-serve-docs-files/route.ts",
    "plugins/astro-serve-docs-files/raw-doc-alternate-link-middleware":
      "src/plugins/astro-serve-docs-files/raw-doc-alternate-link-middleware.ts",
    "plugins/starlight-dom-patches":
      "src/plugins/starlight-dom-patches/index.ts",
    "plugins/starlight-dom-patches/page-script":
      "src/plugins/starlight-dom-patches/page-script.ts",
    "plugins/expressive-code-emphasis":
      "src/plugins/expressive-code-emphasis/index.ts",
  },
  external: [
    "@expressive-code/core",
    "virtual:astro-local-links/settings",
    "virtual:astro-serve-docs-files/settings",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
