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
- Fails `astro dev` and `astro build` at startup when an index file's frontmatter can't be parsed

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
- Fails `astro dev` and `astro build` at startup when a linked page's frontmatter can't be parsed

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

Automatically compiles fenced `tex compile` and `latex compile` code blocks to SVG diagrams during the build process. Uses `pdflatex` and `dvisvgm` for high-quality, cached SVG output, inlined into the page as `<svg>` elements.

**Features:**

- Compiles LaTeX/TikZ code blocks to SVG automatically
- Inlines each compiled tex diagram into the page, with its text selectable and searchable (see [Compile mode](#compile-mode))
- Caches compiled SVGs by content hash (no recompilation if unchanged)
- Comprehensive error reporting with line numbers and formatted LaTeX source
- Fails `astro build` on any tex compile error, listing where each one happened; `astro dev` only shows the error in the page
- Works with Starlight and plain Astro projects
- Requires `svgOutputDir` configuration (no defaults)

**System Requirements:**

This plugin requires the following CLI tools to be installed and available on your system:

- **`pdflatex`**: LaTeX compiler that produces DVI or PDF output
- **`dvisvgm`**: Converts DVI or PDF to SVG format (2.2 or later, for WOFF2 font embedding)

Verify installation by running:

```bash
pdflatex --version
dvisvgm --version
```

If either tool is missing from `PATH` when a `tex compile` block needs compiling, `astro build` fails and `astro dev` stops.

Any other tex compile error (a LaTeX error, a block that isn't a LaTeX document, an unknown `mode`, a failed SVG conversion) is logged in full and shown in the page in place of the diagram. `astro build` still renders every page, then fails at the end with a list of every failing block's `file:line` (or just the doc's path, for an error outside any one block), and leaves orphaned tex diagrams in place.

**Options:**

- `svgOutputDir` (required): Directory where compiled SVG files are written. Resolved against the project root, and must be a subdirectory of Astro's `publicDir` (usually `public/`), or Astro fails to start. Each block's SVG is written here as `<hash>.svg` and reused while the block is unchanged. Pages inline the SVG rather than linking to these files.
- `removeOrphanedSvgs` (optional, default: `false`): When `true`, SVG files that are no longer referenced by any `tex compile` block are deleted automatically. On build, every orphaned tex diagram is swept at the end. In dev, docs that weren't edited aren't re-rendered (Astro's content cache stays on to keep dev fast), so the plugin can't see what they reference: only compiled tex diagrams first written during the current dev session are deleted when a block is edited, and older orphaned tex diagrams stay until the next build.
- `svgClassname` (optional): Default CSS class(es) applied to every compiled tex diagram's inline `<svg>` element. Individual blocks can override this with a `class` meta tag value. The `tex-compiled` class is always present and cannot be overridden.
- `texInputDirs` (optional): Directories, resolved against the project root, that `tex compile` blocks can pull tex input files from with `\input{}`, `\include{}`, `\usepackage{}`, `\includegraphics{}` and similar. Use a trailing `/` to search only that directory, or `//` to search it recursively. Multiple directories are supported, including ones outside the project. Apart from TeX's installed packages, these are the only files a block can read, and only by name (`\input{macros}`): a path relative to the project like `\input{src/latex/macros}`, an absolute path, a path using `..`, or a dotfile doesn't resolve.
  - When any file in these directories changes, every compiled tex diagram is recompiled, including blocks that don't use that file. In `astro dev` this happens on its own: the dev server restarts and re-renders every doc. A file added while dev is running is only watched after the next restart. Dotfiles, dot-dirs and LaTeX build artifacts (`.aux`, `.log`, `.synctex.gz`, ...) don't count.
  - An error inside one of these files is reported with that file's path and line, e.g. `Error (src/latex/macros.tex:2): Undefined control sequence.`
  - If you build in an environment without TeX, relying on committed SVGs, commit the files in these directories too. A build hashes them to find the right SVGs.
  - A directory that doesn't exist fails `astro dev` at startup. `astro build` only warns, since git doesn't keep empty directories, and names the directory if the build then fails because TeX is missing.
- `debug` (optional): `true`, or `{ outputDir?, logFile? }`. When set, a debug tex diagram image (a JPEG copy of each compiled tex diagram) is written to `debug.outputDir` as a flat file list (no mirrored folder structure). Both paths are relative to the integration's codegen dir, `.astro/integrations/astro-latex-compile/`, and default to `debug-images/` and `latex-compile.log`; an empty path, an absolute path, or one that leads outside that dir fails at startup. The resolved image dir is logged when Astro starts. Only blocks that carry a `blockid=<n>` meta tag produce a debug tex diagram image — blocks without it are ignored. The filename format is `<originating-file>--<blockid>-<8-char-dir-checksum>.jpg` (e.g. `tex-test--5-a1b2c3d4.jpg`), where the checksum is an MD5 hash of the originating file's directory, namespacing files so that same-named files from different directories don't collide. Debug tex diagram images are deleted automatically when their block is removed, its `blockid` changes, or its content changes, and every debug tex diagram image in `debug.outputDir` is cleared at the start of a build. If two blocks in one doc share a `blockid`, a warning is logged (even with `debug` off) and only the last block's debug tex diagram image is kept. Every debug tex diagram image (re)write is also appended to `debug.logFile`, which rotates automatically once it grows too large (rolling backups `<logFile>-1.log`, `<logFile>-2.log`, etc.). Compiled tex diagrams are unaffected — the debug output is complementary and intended for local inspection. Its type is exported as `LatexCompileDebugOptions`.

```ts
astroLatexCompile({
  svgOutputDir: "public/static/tex-svgs",
  texInputDirs: ["src/latex//"], // search src/latex/ and all its subdirectories
});
```

**Migrating `debug` from 2.x:** `debug.outputDir` and `debug.logFile` used to resolve against the project root and could be absolute. They now resolve inside `.astro/integrations/astro-latex-compile/`, so absolute paths or paths leading outside it throw, and a relative path like `".astro-latex-compile/"` quietly moves under the codegen dir. Replace the old block with `debug: true` unless you need custom names, and delete the old output dir.

**Migrating `texInputDirs` from 3.x:**

- A block can no longer read a file by its path: not relative to where you run Astro (e.g. `\input{src/latex/macros}`), not absolute, and not through `..`. Add its directory to `texInputDirs` and write `\input{macros}` instead.
- `texInputDirs` now resolve against the project root rather than the directory you run Astro from. If you always run Astro from the project root, nothing changes.
- If those two differed, or a tex input dir held dotfiles or LaTeX build artifacts, every compiled tex diagram's hash changes once. If your deploy builds without TeX, run `astro build` locally and commit the new SVGs before deploying.
- The first `astro dev` start after upgrading re-renders every doc once.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroLatexCompile } from "starlight-cannoli-plugins";
// or: import { astroLatexCompile } from "starlight-cannoli-plugins/astro-latex-compile";

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
\documentclass[border=5pt]{standalone}
\usepackage{tikz}
\begin{document}
\Large
\begin{tikzpicture}
  \node (A) at (0,0) {A};
  \node (B) at (2,0) {B};
  \draw (A) -- (B);
\end{tikzpicture}
\end{document}
```
````

**Document structure:**

Each code block must be a complete, self-contained LaTeX document:

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

- `class="..."`: CSS classes applied to the resulting `<svg>` element (space-separated). The `tex-compiled` class is always included.
- `alt="..."`: Accessible label for the resulting `<svg>` element, set as `role="img"` and `aria-label`. Defaults to `"LaTeX diagram"` if omitted.
- `mode=dvi` or `mode=pdf`: The block's [compile mode](#compile-mode). Defaults to `dvi`.

````markdown
```tex compile class="bg-white rounded-1" alt="A commutative diagram"
\documentclass[border=5pt]{standalone}
\usepackage{tikz}
\begin{document}
\Large
\begin{tikzpicture}
  \node {Custom styled diagram};
\end{tikzpicture}
\end{document}
```
````

#### Compile mode

By default (`mode=dvi`), a block is compiled to DVI and converted with its fonts embedded, so the compiled tex diagram's text stays real text: you can select it, copy it and find it with the browser's search. Copied text comes out the way TeX placed the glyphs, so `$x^2+\alpha$` copies as something like `x2+α`.

DVI can't hold every kind of graphic. `\includegraphics` of a PNG, JPEG or PDF fails in `dvi` mode with an error like `Unknown graphics extension: .png`. For those blocks, add `mode=pdf`, which compiles through PDF and draws all text as shapes:

````markdown
```tex compile mode=pdf
\documentclass{standalone}
\usepackage{graphicx}
\begin{document}
\includegraphics{photo.png}
\end{document}
```
````

Each compiled tex diagram's ids, classes and fonts are prefixed with its hash, so several can share a page. Wide ones shrink to fit the content column (`max-width: 100%`).

**Migrating to inline SVGs:** every compiled tex diagram's hash changes once, so every block recompiles on the first build. With `removeOrphanedSvgs`, the build removes the old SVGs; otherwise delete them from `svgOutputDir` by hand. If your deploy builds without TeX, run `astro build` locally and commit the new SVGs before deploying.

### Remark GFM Slug

A remark plugin that assigns heading IDs using the same GFM slug algorithm as VS Code and GitHub, before Astro's internal `rehypeHeadingIds` runs. Since `rehypeHeadingIds` skips headings that already have an `id`, this takes precedence and produces fragment anchors that match what VS Code's markdown link resolver expects.

This is especially useful when headings contain inline math or other syntax that Astro/Starlight would otherwise slugify from the rendered HTML output (producing long encoded IDs that differ from VS Code's raw-text slugification).

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { remarkGfmSlug } from "starlight-cannoli-plugins";

export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkGfmSlug, // must come before remark-math or other transforming plugins
    ],
  },
});
```

### Local Links

An Astro integration for the local links in your docs, meaning every `<a href>` and `<img src>` that points somewhere inside the site. It does two things, each of which you can turn off:

- **Link validation** fails on a local link in a page's content whose target doesn't exist.
- **Link normalization** rewrites relative links (`./other`, `../ref/page`) to root-absolute ones (`/guide/other`). A relative link in the HTML is resolved against the page's URL, so it can point somewhere different depending on whether your host adds a trailing slash. After normalization, a link means the same thing everywhere, and it matches what your editor opens on ctrl+click.

Both run on each page's final HTML, in dev and in build. That means they cover Markdown links, raw HTML in `.md`, JSX in `.mdx` (including `src={...}` expressions) and HTML rendered by components.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroLocalLinks } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [astroLocalLinks(), starlight({ title: "My Docs" })],
});
```

Or import directly:

```ts
import { astroLocalLinks } from "starlight-cannoli-plugins/astro-local-links";
```

**Options:**

- `validate` (optional, default: `true`): `false` turns link validation off. Pass `{ skipPatterns: [...] }` to skip links that match any of the glob patterns (see below).
- `normalize` (optional, default: `true`): `false` turns link normalization off.

**What counts as an existing target:**

- A source doc. `/reference/schemas` matches `reference/schemas.md(x)` or `reference/schemas/index.md(x)`, and `/reference/schemas/index` matches the latter. If both files exist, the link is reported as ambiguous.
- A file in `public/`, like `/static/img/logo.png`.

A file that sits next to your docs in `src/content/docs/` (a PDF, an image) only counts once it's in `public/`, because until then its URL would 404. [Sync Docs to Public](#sync-docs-to-public) does that copying for you.

Pages that aren't rendered from a source doc, like `src/pages/*.astro` routes, can't be checked. Link to them with one of the skips below.

**When it fails:**

- `astro build` checks every page, then fails once with a list of every broken local link, grouped by source doc.
- `astro dev` shows the broken links on the page's error screen when you open it.

**What it leaves alone:**

- Anything with a URL scheme (`https:`, `mailto:`, `tel:`, `data:`...), protocol-relative `//host` links, and fragment-only links like `#section`.
- URLs that Astro and Vite generate, like optimized images (`/_image`, `/_astro/`).
- Link validation only looks inside Starlight's content area (`.sl-markdown-content`), so the sidebar, pagination and head aren't checked. Link normalization applies to the whole page.

**Skipping link validation:**

These only skip link validation. The link still gets normalized.

1. **Question mark prefix** (per link, in Markdown). The `?` is removed from the output.

   ```md
   [Grade Calculator](?./csci-320-331-obrenic/grade-calculator)
   ```

2. **`data-no-link-check` attribute** (per link, in HTML). The attribute is removed from the output.

   ```mdx
   <a href="./csci-320-331-obrenic/grade-calculator" data-no-link-check>
     Grade Calculator
   </a>
   ```

3. **`skipPatterns`** (in config). Glob patterns matched against the link's root-absolute path, including any `#fragment`.

   ```ts
   astroLocalLinks({
     validate: {
       skipPatterns: [
         "/csci-320-331-obrenic/grade-calculator", // exact match
         "**/draft-*", // glob pattern
       ],
     },
   });
   ```

**Limitations:**

- Astro's `base` option isn't supported yet. Setting it makes the integration throw at startup.
- A page's source doc is found from its URL, so a doc whose URL differs from its file path (a frontmatter `slug`, or a file name Starlight changes when making its URL) isn't found, and the integration throws.

**Migrating from `rehypeValidateLinks` and `astroNormalizePaths`:**

Both are replaced by `astroLocalLinks` and now throw when called. Remove `rehypeValidateLinks` from `markdown.rehypePlugins` and `astroNormalizePaths()` from `integrations`, then add `astroLocalLinks()`. `rehypeValidateLinks`' `skipPatterns` moves to `astroLocalLinks({ validate: { skipPatterns } })`.

### Sync Docs to Public

Syncs `src/content/docs/` to `public/` so local files (e.g., PDFs, images) referenced in markdown are served by the dev server and included in builds. In dev mode, it watches for file changes and re-syncs automatically — no restart needed.

**Features:**

- Syncs once at build start and once at dev server start; an error in either stops the build or the server from starting
- Watches for changes in dev mode and re-syncs automatically (debounced)
- Preserves specified child directories in `public/` during sync (e.g., `static/`)
- Supports glob patterns to exclude files from syncing
- Fails `astro build` when an md/mdx file's frontmatter can't be parsed, since it can't tell whether the file is a draft. In dev, a re-sync after a save only logs the error.

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
- `exposePageSrcButton` (optional, default: `false`): Injects a client-side script on every page that adds a `⋮` dropdown next to the page's `<h1>` with "Copy Page", "Copy raw URL", and "View raw" actions for the page's raw markdown source.
- `enableAskAiOption` (optional, default: `false`): Adds "Ask ChatGPT", "Ask Claude", and "Ask Gemini" entries to the same `⋮` dropdown, each opening the respective chat app in a new tab with a prompt pre-filled to read the page's raw markdown URL. Independent of `exposePageSrcButton` — enabling this on its own still injects the dropdown button, containing only the "Ask" entries.

```ts
syncDocsToPublic({
  preserveDirs: ["static"],
  ignorePatterns: ["**/*.txt", "**/drafts/**"],
  exposePageSrcButton: true,
  enableAskAiOption: true,
});
```

### Starlight DOM Patches

An Astro integration that injects a client-side script to apply opt-in DOM patches on every page. Each patch is disabled by default and must be explicitly enabled.

**Options:**

- `hideSingleLineGutters` (optional, default: `false`): Hides the line number gutter on Expressive Code blocks that contain only a single line.
- `syncTocLabelsFromHeadings` (optional, default: `false`): Copies the rendered HTML of each heading into its matching Starlight TOC anchor label, so the TOC properly reflects any custom markup (e.g. math) present in the heading.
- `limitDetailsElementHeight` (optional, default: `false`): Limits the height of expanded `<details>` elements and makes their content scrollable.
- `offerToggleAllDetails` (optional, default: `false`): Injects an "Expand All Dropdowns" toggle checkbox into the right sidebar (before `nav[aria-labelledby="starlight__on-this-page"]`). Clicking it opens or closes every `<details>` element on the page at once. Only appears on pages that contain at least one visible `<details>` element.
- `offerTabbedContent` (optional, default: `false`): Injects a "Tabbed view" toggle checkbox immediately after `#starlight__on-this-page` in the right sidebar. When enabled by the user, the page's markdown content is reorganised into tabs — one per `<h2>` heading, plus an optional "Main" tab for any content that appears before the first `<h2>`. The toggle defaults to off on every page load and is not persisted. Only activates when the page has at least two sections (i.e. two or more `<h2>` elements, or one `<h2>` with pre-heading content). Has no effect on pages that lack `#starlight__on-this-page` (e.g. pages with the TOC disabled). Clicking a TOC anchor while tabs are enabled automatically switches to the tab containing the target heading. The generated elements use the classes `tabbed-content`, `tabbed-content-nav`, `tabbed-content-tab`, and `tabbed-content-panel` for styling; toggle button uses the existing `.toggle-checkbox-btn` class.
- `decorateExternalLinks` (optional): Scans all links inside `.sl-markdown-content` and prepends a destination-specific icon to recognised link targets. Pass an object enabling each supported destination individually:
  - `youtube` (default: `false`): prepends a YouTube play-button SVG (class `yt-icon`, `aria-hidden`, inherits `currentColor`) to links pointing to `youtube.com` or `youtu.be`.

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
      decorateExternalLinks: {
        youtube: true,
      },
    }),
    starlight({ title: "My Docs" }),
  ],
});
```

### Expressive Code Emphasis

An Expressive Code plugin that highlights specific terms inside code blocks using the `emph` meta attribute. Matched terms are wrapped in a `<span class="fw-supreme">` for custom styling.

**Features:**

- Comma-separated list of terms to emphasize per code block
- Exact-word matching: terms surrounded by word boundaries or whitespace/string edges are matched; partial substrings are not
- Supports non-word characters (e.g. `(`, `]`, `;`) as well as identifiers

**Usage:**

Register the plugin with Expressive Code:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { expressiveCodeEmphasis } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      expressiveCode: {
        plugins: [expressiveCodeEmphasis()],
      },
    }),
  ],
});
```

Then use the `emph` meta attribute on any code block:

````markdown
```js emph="foo,bar,()"
function foo() {
  return bar() || ();
}
```
````

Multiple terms are separated by commas. Each term is matched as a whole unit — it must be surrounded by whitespace, start/end of line, or (for terms that start/end with word characters) word boundaries.

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
