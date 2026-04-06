import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar": "src/plugins/starlight-index-only-sidebar.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
    "plugins/remark-tikz-compile": "src/plugins/remark-tikz-compile/index.ts",
    "plugins/starlight-tikz-compile": "src/plugins/remark-tikz-compile/starlight-plugin.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
