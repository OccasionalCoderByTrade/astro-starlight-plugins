import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/starlight-index-only-sidebar": "src/plugins/starlight-index-only-sidebar.ts",
    "plugins/rehype-validate-links": "src/plugins/rehype-validate-links.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  tsconfig: "./tsconfig.build.json",
});
