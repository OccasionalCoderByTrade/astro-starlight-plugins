# Cannoli Starlight Plugins

A collection of powerful plugins for [Astro Starlight](https://starlight.astro.build/) documentation sites.

## Plugins

### Starlight Index-Only Sidebar

Automatically generates a nested Starlight sidebar by recursively scanning directories for `index.md`/`index.mdx` files. Only directories with index files appear in the sidebar, creating a clean, minimal navigation structure.

**Features:**
- Recursively scans directories for `index.md` or `index.mdx` files
- Creates sidebar entries only for pages with index files
- Respects frontmatter: `draft: true` and `sidebar.hidden: true` hide entries
- Automatically collapses single-child groups (no intermediate wrappers)
- Configurable depth limiting to flatten deeply nested content
- Two labeling modes: directory names or frontmatter titles
- Ignores `assets` directories entirely

**Options:**

- `directories` (required): Array of directory names to scan (e.g., `["guides", "api"]`)
- `maxDepthNesting` (optional, default: `100`): Maximum nesting depth. Root is level 0. At max depth, deeper index files are flattened as sibling items.
- `dirnameDeterminesLabels` (optional, default: `true`): When `true`, all labels use raw directory names. When `false`, slug item labels come from frontmatter `title` field; group labels still use directory names.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightIndexOnlySidebar } from "cannoli-starlight-plugins";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightIndexOnlySidebar({
          directories: ["guides", "api", "tutorials"],
          maxDepthNesting: 2,           // optional
          dirnameDeterminesLabels: false, // optional
        }),
      ],
    }),
  ],
});
```

### Rehype Validate Links

A rehype plugin that validates all internal links in your Markdown/MDX files at build time. Links without matching files will cause the build to fail.

**Features:**
- Validates `<a href>` and `<img src>` attributes
- Supports relative paths (`../other`) and absolute paths (`/some/page`)
- Auto-expands extensionless links to match `.md` or `.mdx` files
- Converts internal links to site-absolute paths
- Throws build errors for broken links
- Skip validation for forward-reference links using multiple approaches

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { rehypeValidateLinks } from "cannoli-starlight-plugins";

export default defineConfig({
  markdown: {
    rehypePlugins: [
      rehypeValidateLinks,
    ],
  },
});
```

Or import directly:

```ts
import { rehypeValidateLinks } from "cannoli-starlight-plugins/rehype-validate-links";
```

**Skipping Link Validation:**

There are three ways to skip validation for specific links:

**1. Question Mark Prefix** (Per-link, in markdown)

Prepend a `?` to the link href to skip validation:

```mdx
[Grade Calculator](?csci-320-331-obrenic/grade-calculator)
[Grade Calculator](?./csci-320-331-obrenic/grade-calculator)
[Grade Calculator](?/csci-320-331-obrenic/grade-calculator)
```

**2. HTML Data Attribute** (Per-link, requires HTML syntax)

Use the `data-no-link-check` attribute on anchor tags:

```mdx
<a href="csci-320-331-obrenic/grade-calculator" data-no-link-check>Grade Calculator</a>
```

**3. Global Skip Patterns** (Configuration-based)

Use the `skipPatterns` option to exclude links matching glob patterns:

```ts
// astro.config.mjs
export default defineConfig({
  markdown: {
    rehypePlugins: [
      [rehypeValidateLinks, {
        skipPatterns: [
          '/csci-320-331-obrenic/grade-calculator',  // exact match
          '**/draft-*',                               // glob pattern
        ]
      }],
    ],
  },
});
```

## Installation

```bash
npm install cannoli-starlight-plugins
```

With pnpm:

```bash
pnpm add cannoli-starlight-plugins
```

With yarn:

```bash
yarn add cannoli-starlight-plugins
```

## Peer Dependencies

- `astro` ≥ 5.0.0
- `@astrojs/starlight` ≥ 0.30.0 (optional, only needed if using `starlightIndexOnlySidebar`)

## License

MIT

## Contributing

Contributions welcome! Feel free to open issues or submit pull requests.
