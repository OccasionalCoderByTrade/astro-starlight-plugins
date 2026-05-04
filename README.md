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
import { starlightIndexOnlySidebar } from "starlight-cannoli-plugins";

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

### Starlight Index-Sourced Sidebar

Generates a Starlight sidebar by parsing markdown links out of `index.md` files. Instead of scanning the filesystem for every index file, this plugin reads the links declared in each directory's own `index.md` and uses those to build the sidebar — giving you explicit, author-controlled navigation with automatic nesting.

**Features:**

- Builds sidebar entries from the links written in each directory's `index.md`
- Links ending in `/index` pointing to an `index.md` create nested sub-groups (recursed automatically)
- Links ending in `/index` pointing to an `index.mdx` add it as a single leaf item without recursing into it
- Sub-group depth limited by `maxDepthNesting`; deeper items are flattened
- Each index page itself appears as the first leaf item in its group
- Labels for leaf items come from the linked page's frontmatter `title`
- Respects frontmatter: `draft: true`, `pagefind: false`, and `sidebar.hidden: true` hide entries
- Links to non-markdown files (images, PDFs, etc.) are silently skipped
- Links to markdown files that do not exist on disk are silently skipped
- External links and same-page anchor links (`#section`) are silently skipped

**Options:**

- `directories` (required): Array of directory names to scan (relative to `src/content/docs`)
- `maxDepthNesting` (optional, default: `100`): Maximum nesting depth. At this depth, sub-index groups are not created and their items are flattened into the current level instead. With `maxDepthNesting: 1`, all items are flat under the root group.
- `indexMarker` (optional, default: `undefined`): A string prepended to the label of every index entry to visually distinguish it from regular sidebar entries. Example: `"★"`.

**Link conventions in `index.md`:**

- Links to sub-sections must end in `/index` (e.g. `[Subtopic](./subtopic/index)`) — the plugin recurses into those if the target is an `index.md`, or adds a leaf item if the target is an `index.mdx`
- All other relative links become flat leaf items
- External URLs are ignored

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightIndexSourcedSidebar } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightIndexSourcedSidebar({
          directories: ["guides", "reference"],
          maxDepthNesting: 2, // optional
        }),
      ],
    }),
  ],
});
```

**Example `index.md`:**

```markdown
---
title: Guides
---

- [Getting Started](./getting-started)
- [Configuration](./configuration)
- [Advanced Topics](./advanced/index)
```

### LaTeX Compile

Automatically compiles fenced `tex compile` and `latex compile` code blocks to SVG diagrams during the build process. Uses `pdflatex` and `dvisvgm` for high-quality, cached SVG output.

**Features:**

- Compiles LaTeX/TikZ code blocks to SVG automatically
- Caches compiled SVGs by content hash (no recompilation if unchanged)
- Comprehensive error reporting with line numbers and formatted LaTeX source
- Supports custom preamble via `% ===` separator in code blocks
- Works with Starlight and plain Astro projects
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

**Options:**

- `svgOutputDir` (required): Directory where compiled SVG files are written. Must be inside `public/` so Astro serves them as static assets.
- `removeOrphanedSvgs` (optional, default: `false`): When `true`, SVG files that are no longer referenced by any `tex compile` block are deleted automatically. In dev mode, stale SVGs are removed immediately when a block is edited. On build, any remaining orphans are swept at the end.
- `texInputDirs` (optional): Directories added to the TeX input search path (`TEXINPUTS`), allowing `\input{}` and `\include{}` to resolve files from your project. Use a trailing `/` to search only that directory, or `//` to search it recursively. Multiple directories are supported.

```ts
astroLatexCompile({
  svgOutputDir: "public/static/tex-svgs",
  texInputDirs: ["src/latex//"], // search src/latex/ and all its subdirectories
});
```

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroLatexCompile } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [
    astroLatexCompile({
      svgOutputDir: "public/static/tex-svgs",
      removeOrphanedSvgs: true, // optional
    }),
    starlight({ title: "My Docs" }),
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

**Meta Attributes:**

The following attributes can be added to the opening fence:

- `class="..."`: CSS classes applied to the resulting `<img>` element (space-separated). The `tex-compiled` class is always included.
- `alt="..."`: Alt text for the resulting `<img>` element. Defaults to `"LaTeX diagram"` if omitted.

````markdown
```tex compile class="bg-white rounded-1" alt="A commutative diagram"
\begin{tikzpicture}
  \node {Custom styled diagram};
\end{tikzpicture}
```
````

### Remark LaTeX Compile (low-level)

The underlying remark plugin used by `astroLatexCompile`. Use this directly if you need to wire the transformer into a custom pipeline — most users should use `astroLatexCompile` instead.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { remarkLatexCompile } from "starlight-cannoli-plugins/astro-latex-compile";

export default defineConfig({
  markdown: {
    remarkPlugins: [
      [remarkLatexCompile, { svgOutputDir: "public/static/tex-svgs" }],
    ],
  },
});
```

Note: when used directly (without `astroLatexCompile`), the Starlight content layer cache is not cleared automatically, so SVGs may not recompile on repeat builds in Starlight projects.

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
import { rehypeValidateLinks } from "starlight-cannoli-plugins";

export default defineConfig({
  markdown: {
    rehypePlugins: [rehypeValidateLinks],
  },
});
```

Or import directly:

```ts
import { rehypeValidateLinks } from "starlight-cannoli-plugins/rehype-validate-links";
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

### Sync Docs to Public

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
import { syncDocsToPublic } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [
    syncDocsToPublic({ preserveDirs: ["static"] }),
    starlight({ title: "My Docs" }),
  ],
});
```

**Options:**

- `preserveDirs` (required): Names of child directories inside `public/` to preserve during sync. These will not be deleted when re-syncing.
- `ignorePatterns` (optional): Glob patterns for files to exclude from syncing. Patterns are matched against paths relative to `src/content/docs/`.

```ts
syncDocsToPublic({
  preserveDirs: ["static"],
  ignorePatterns: ["**/*.txt", "**/drafts/**"],
});
```

### Starlight DOM Patches

An Astro integration that injects a client-side script to apply opt-in DOM patches on every page. Each patch is disabled by default and must be explicitly enabled.

**Options:**

- `hideSingleLineGutters` (optional, default: `false`): Hides the line number gutter on Expressive Code blocks that contain only a single line.
- `syncTocLabelsFromHeadings` (optional, default: `false`): Copies the rendered HTML of each heading into its matching Starlight TOC anchor label, so the TOC properly reflects any custom markup (e.g. math) present in the heading.
- `limitDetailsElementHeight` (optional, default: `false`): Wraps the content of every `<details>` element (excluding its `<summary>`) in a `<div class="details-wrapper">`, useful for applying consistent spacing or animation styles.
- `offerToggleAllDetails` (optional, default: `false`): Injects an "Expand All Dropdowns" toggle checkbox into the right sidebar (before `nav[aria-labelledby="starlight__on-this-page"]`). Clicking it opens or closes every `<details>` element on the page at once. Only appears on pages that contain at least one visible `<details>` element.
- `offerTabbedContent` (optional, default: `false`): Injects a "Tabbed view" toggle checkbox immediately after `#starlight__on-this-page` in the right sidebar. When enabled by the user, the page's markdown content is reorganised into tabs — one per `<h2>` heading, plus an optional "Main" tab for any content that appears before the first `<h2>`. The toggle state is persisted to `localStorage`; active tab selection is not persisted. Only activates when the page has at least two sections (i.e. two or more `<h2>` elements, or one `<h2>` with pre-heading content). Has no effect on pages that lack `#starlight__on-this-page` (e.g. pages with the TOC disabled). Clicking a TOC anchor while tabs are enabled automatically switches to the tab containing the target heading. The generated elements use the classes `tabbed-content`, `tabbed-content-nav`, `tabbed-content-tab`, and `tabbed-content-panel` for styling; toggle button uses the existing `.toggle-checkbox-btn` class.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightDomPatches } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [
    starlightDomPatches({
      hideSingleLineGutters: true,
      syncTocLabelsFromHeadings: true,
      limitDetailsElementHeight: true,
      offerToggleAllDetails: true,
      offerTabbedContent: true,
    }),
    starlight({ title: "My Docs" }),
  ],
});
```

## CLI Utilities

### cannoli-latex-cleanup

A manual cleanup utility for the LaTeX compile plugin. Scans your markdown source files for all `tex compile` code blocks, hashes them, and identifies orphaned SVG files in the output directory that are no longer referenced by any code block.

> **Note:** If you use `removeOrphanedSvgs: true` in your `astroLatexCompile` config, this CLI is generally not needed — orphaned SVGs are cleaned up automatically during both dev and build.

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

- `--svg-dir` (required): Path to the SVG output directory configured in `astroLatexCompile`
- `--docs-dir` (optional, default: `src/content/docs`): Path to markdown source directory
- `--check`: List orphaned SVGs without deleting
- `--delete`: Delete orphaned SVGs

## Installation

```bash
npm install starlight-cannoli-plugins
```

With pnpm:

```bash
pnpm add starlight-cannoli-plugins
```

With yarn:

```bash
yarn add starlight-cannoli-plugins
```

## Peer Dependencies

- `astro` ≥ 5.0.0
- `@astrojs/starlight` ≥ 0.30.0 (optional, only needed if using `starlightIndexOnlySidebar`)

## License

MIT

## Contributing

Contributions welcome! Feel free to open issues or submit pull requests.
