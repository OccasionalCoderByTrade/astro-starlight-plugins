export { starlightIndexOnlySidebar } from "./plugins/starlight-index-only-sidebar/index.js";
export {
  starlightDomPatches,
  type DomPatchesOptions,
} from "./plugins/starlight-dom-patches/index.js";
export {
  syncDocsToPublic,
  type SyncDocsToPublicOptions,
} from "./plugins/astro-sync-docs-to-public/index.js";
export { rehypeValidateLinks } from "./plugins/rehype-validate-links.js";
export { astroNormalizePaths } from "./plugins/astro-normalize-paths.js";
export { default as remarkLatexCompile } from "./plugins/astro-latex-compile/index.js";
export {
  astroLatexCompile,
  type LatexCompileOptions,
} from "./plugins/astro-latex-compile/astro-integration.js";
