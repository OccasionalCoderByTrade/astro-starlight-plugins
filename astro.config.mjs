// @ts-check
import starlight from "@astrojs/starlight";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

import { defineConfig } from "astro/config";
import rehypeGraphviz from "rehype-graphviz";
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";

import { rehypeValidateLinks } from "./src/plugins/rehype-validate-links.ts";
import { starlightIndexOnlySidebar } from "./src/plugins/starlight-index-only-sidebar.ts";
import { astroNormalizePaths } from "./src/plugins/astro-normalize-paths.ts";

// https://astro.build/config
export default defineConfig({
  outDir: "./site-dist",
  markdown: {
    remarkPlugins: [
      remarkMath, // adds support for math
    ],
    rehypePlugins: [
      rehypeMathjax, // co-dependent with remark-math
      rehypeGraphviz, // Graphviz diagram support
      rehypeValidateLinks, // validate links and convert to absolute paths
    ],
  },
  integrations: [
    astroNormalizePaths(),
    starlight({
      title: "My Grand Amazing Site",
      tableOfContents: {
        minHeadingLevel: 2, // h1 not included since it conflicts with frontmatter title
        maxHeadingLevel: 6, // include up to h6 in table of contents
      },
      plugins: [
        starlightIndexOnlySidebar({
          maxDepthNesting: 1,
          dirnameDeterminesLabels: false,
          directories: [
            "reference",
            "csci-323-algorithms",
            "csci-340-operating-systems",
            "csci-328-algorithms-for-big-data",
          ],
        }),
      ],
      customCss: ["./src/styles/custom.scss"],
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
});
