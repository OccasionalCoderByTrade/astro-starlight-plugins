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
          maxDepthNesting: 2, // optional
          dirnameDeterminesLabels: false, // optional
        }),
      ],
    }),
  ],
});
```

### Starlight LaTeX Compile

Automatically compiles fenced `tex compile` and `latex compile` code blocks to SVG diagrams during the build process. Uses `pdflatex` and `dvisvgm` for high-quality, cached SVG output.

**Features:**

- Compiles LaTeX/TikZ code blocks to SVG automatically
- Caches compiled SVGs by content hash (no recompilation if unchanged)
- Comprehensive error reporting with line numbers and formatted LaTeX source
- Supports custom preamble via `% ===` separator in code blocks
- Works seamlessly with Starlight's content pipeline
- Requires `svgOutputDir` configuration (no defaults)

**System Requirements:**

This plugin requires the following CLI tools to be installed and available on your system:

- **`pdflatex`** — LaTeX compiler that produces PDF output
- **`dvisvgm`** — Converts PDF to SVG format

Verify installation by running:

```bash
pdflatex --version
dvisvgm --version
```

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightLatexCompile } from "cannoli-starlight-plugins";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightLatexCompile({
          svgOutputDir: "public/static/tex-svgs",
        }),
      ],
    }),
  ],
});
```

**Markdown Syntax:**

Use either ` ```tex compile ` or ` ```latex compile ` — both work identically:

````markdown
```tex compile
\begin{tikzpicture}
  \node (A) at (0,0) {A};
  \node (B) at (2,0) {B};
  \draw (A) -- (B);
\end{tikzpicture}
```
````

**Minimal approach:**

Use `% ===` to separate an optional custom preamble from your diagram content. The plugin wraps everything in the following document structure:

```latex
\documentclass[border=5pt]{standalone}
{your preamble}
\begin{document}
\Large
{your content}
\end{document}
```

Example **minimal** tex code block:

````markdown
```tex compile
\usepackage{tikz-3dplot}

% ===

\begin{tikzpicture}
  % diagram code here
\end{tikzpicture}
```
````

If no `% ===` separator is present, the entire block is treated as content and wrapped in the same default document structure (with an empty preamble).

**Complete Document Control:**

If your code block contains both `\documentclass` and `\begin{document}`, the plugin treats it as a complete, self-contained LaTeX document and uses it as-is without checking for a `% ===` separator for a preamble:

````markdown
```tex compile
\documentclass[border=10pt]{standalone}
\usepackage{tikz}
\usepackage{amsmath}

\begin{document}

\begin{equation*}
  E = mc^2
\end{equation*}

\end{document}
```
````

**Custom CSS Classes:**

Add custom CSS classes the `tex compile` code block to have them applied to the resulting `<img>` element:

````markdown
```tex compile class="bg-white rounded-1"
\begin{tikzpicture}
  \node {Custom styled diagram};
\end{tikzpicture}
```
````

The img element will have classes: `tex-compiled bg-white rounded-1` (note: the `tex-compiled` class is always included by default).

### Remark LaTeX Compile

The underlying remark plugin that powers `starlightLatexCompile`. Use this directly in Astro projects that don't use Starlight.

**System Requirements:**

Same as `starlightLatexCompile`:

- **`pdflatex`** — LaTeX compiler that produces PDF output
- **`dvisvgm`** — Converts PDF to SVG format

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { remarkLatexCompile } from "cannoli-starlight-plugins/remark-latex-compile";

export default defineConfig({
  markdown: {
    remarkPlugins: [
      [
        remarkLatexCompile,
        {
          svgOutputDir: "public/static/tex-svgs",
        },
      ],
    ],
  },
});
```

The plugin works identically to `starlightLatexCompile` but is configured directly in the Astro markdown pipeline.

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
    rehypePlugins: [rehypeValidateLinks],
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
<a href="csci-320-331-obrenic/grade-calculator" data-no-link-check>
  Grade Calculator
</a>
```

**3. Global Skip Patterns** (Configuration-based)

Use the `skipPatterns` option to exclude links matching glob patterns:

```ts
// astro.config.mjs
export default defineConfig({
  markdown: {
    rehypePlugins: [
      [
        rehypeValidateLinks,
        {
          skipPatterns: [
            "/csci-320-331-obrenic/grade-calculator", // exact match
            "**/draft-*", // glob pattern
          ],
        },
      ],
    ],
  },
});
```

### Starlight Sync Docs to Public

Syncs `src/content/docs/` to `public/` so local files (e.g., PDFs, images) referenced in markdown are served by the dev server and included in builds. In dev mode, it watches for file changes and re-syncs automatically — no restart needed.

**Features:**

- Syncs once at build start
- Watches for changes in dev mode and re-syncs automatically (debounced)
- Preserves specified child directories in `public/` during sync (e.g., `static/`)
- Supports glob patterns to exclude files from syncing

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightSyncDocsToPublic } from "cannoli-starlight-plugins";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightSyncDocsToPublic({
          preserveDirs: ["static"],
        }),
      ],
    }),
  ],
});
```

**Options:**

- `preserveDirs` (required): Names of child directories inside `public/` to preserve during sync. These will not be deleted when re-syncing.
- `ignorePatterns` (optional): Glob patterns for files to exclude from syncing. Patterns are matched against paths relative to `src/content/docs/`.

```ts
starlightSyncDocsToPublic({
  preserveDirs: ["static"],
  ignorePatterns: ["**/*.txt", "**/drafts/**"],
});
```

## CLI Utilities

### cannoli-latex-cleanup

A cleanup utility for the LaTeX compile plugin. Scans your markdown source files for all `tex compile` code blocks, hashes them, and identifies orphaned SVG files in the output directory that are no longer referenced by any code block.

**Usage:**

Check for orphaned SVGs without deleting:

```bash
npx cannoli-latex-cleanup --svg-dir public/static/tex-svgs --check
```

Delete orphaned SVGs:

```bash
npx cannoli-latex-cleanup --svg-dir public/static/tex-svgs --delete
```

With custom docs directory (defaults to `src/content/docs`):

```bash
npx cannoli-latex-cleanup --svg-dir public/static/tex-svgs --docs-dir ./src/content/docs --delete
```

**Options:**

- `--svg-dir` (required): Path to the SVG output directory configured in `starlightLatexCompile`
- `--docs-dir` (optional, default: `src/content/docs`): Path to markdown source directory
- `--check`: List orphaned SVGs without deleting
- `--delete`: Delete orphaned SVGs

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
