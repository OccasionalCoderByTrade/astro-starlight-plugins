# Cannoli Starlight Plugins

A collection of powerful plugins for [Astro Starlight](https://starlight.astro.build/) documentation sites.

## Plugins

### Starlight Index-Only Sidebar

Automatically generates your Starlight sidebar by scanning for `index.md` files in specified directories. Only directories containing an `index.md` file will appear in the sidebar.

**Features:**
- Scans directories recursively for `index.md` files
- Respects frontmatter: `draft: true` and `sidebar.hidden: true` hide entries
- Option to use directory names as sidebar labels with automatic formatting (e.g., `csci-316` → `CSCI 316`)
- No manual sidebar configuration needed

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
          directories: [
            { label: "Guides", directory: "guides" },
            { label: "API Docs", directory: "api" },
          ],
          dirnameDeterminesLabel: false, // optional: use directory names as labels
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
