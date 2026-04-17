// @ts-check
import starlight from "@astrojs/starlight";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

import { defineConfig } from "astro/config";
import addClasses from "rehype-class-names";
import rehypeGraphviz from "rehype-graphviz";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import {
  astroLatexCompile,
  rehypeValidateLinks,
  starlightIndexOnlySidebar,
  syncDocsToPublic,
} from "./src";

// Common Config Items
const SITE_NAME = "My Grand Amazing Site";
const STARLIGHT_SIDEBAR_CONFIG = starlightIndexOnlySidebar({
  maxDepthNesting: 1,
  dirnameDeterminesLabels: false,
  directories: [
    "reference",
    "csci-323-algorithms",
    "csci-340-operating-systems",
    "csci-328-algorithms-for-big-data",
  ],
});

// https://astro.build/config
export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkMath, // adds support for math
    ],
    rehypePlugins: [
      rehypeKatex, // co-dependent with remark-math
      [
        addClasses,
        { ".katex": "not-content", "mjx-container>svg": "not-content" },
      ],
      rehypeGraphviz, // Graphviz diagram support
      rehypeValidateLinks, // validate links and convert to absolute paths
    ],
  },
  integrations: [
    astroLatexCompile({
      svgOutputDir: "public/static/tex-svgs",
      removeOrphanedSvgs: true,
    }),
    syncDocsToPublic({
      preserveDirs: ["static"],
      exposePageSrcButton: true,
    }),
    // astroNormalizePaths(),
    starlight({
      title: SITE_NAME,
      tableOfContents: {
        minHeadingLevel: 2, // h1 not included since it conflicts with frontmatter title
        maxHeadingLevel: 6, // include up to h6 in table of contents
      },
      plugins: [STARLIGHT_SIDEBAR_CONFIG],
      customCss: ["/src/styles/main.scss", "katex/dist/katex.min.css"],
      expressiveCode: {
        plugins: [pluginLineNumbers()],
        defaultProps: {
          showLineNumbers: true,
          overridesByLang: {
            text: {
              showLineNumbers: false,
            },
          },
        },
      },
      head: [
        {
          tag: "script",
          attrs: {
            type: "module",
            src: "/static/js/index.js",
          },
        },
      ],
    }),
  ],
  vite: {
    ssr: {
      noExternal: ["katex"],
    },
  },
});
