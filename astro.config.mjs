// @ts-check
import starlight from "@astrojs/starlight";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

import { defineConfig } from "astro/config";
import rehypeGraphviz from "rehype-graphviz";
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";

import rehypeValidateLinks from "./src/plugins/rehype-validate-links";
import starlightIndexOnlySidebar from "./src/plugins/starlight-index-only-sidebar";

// https://astro.build/config
export default defineConfig({
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
    starlight({
      title: "My Grand Amazing Site",
      tableOfContents: {
        minHeadingLevel: 2, // h1 not included since it conflicts with frontmatter title
        maxHeadingLevel: 6, // include up to h6 in table of contents
      },
      plugins: [
        starlightIndexOnlySidebar({
          directories: [
            { label: "Reference", directory: "reference" },
            { label: "Algorithms", directory: "csci-323-algorithms" },
            {
              label: "Operating Systems",
              directory: "csci-340-operating-systems",
            },
            {
              label: "Algorithms for Big Data",
              directory: "csci-328-algorithms-for-big-data",
            },
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
