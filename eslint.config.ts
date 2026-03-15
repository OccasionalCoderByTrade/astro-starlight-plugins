import js from "@eslint/js";
import markdown from "@eslint/markdown";

import { noH1Headers, requireFrontmatter } from "eslint-md-cannoli-plugins";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["dist/", ".astro/", "site-dist/"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/**/*.md"],
    plugins: {
      // @ts-expect-error - Type 'typeof plugin' is not assignable to type 'Plugin'.
      markdown,
      cannoli: {
        rules: {
          "require-frontmatter": requireFrontmatter,
          "no-h1-headers": noH1Headers,
        },
      },
    },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
    rules: {
      "cannoli/require-frontmatter": "error",
      "cannoli/no-h1-headers": "error",
      "markdown/no-missing-label-refs": "off",
      // "markdown/no-duplicate-headings": "error",
    },
  },
]);
