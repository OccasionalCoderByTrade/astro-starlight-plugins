# Cannoli Starlight Plugins

A collection of powerful plugins for [Astro Starlight](https://starlight.astro.build/) documentation sites.

## Upgrading from 3.x

4.0.0 has breaking changes in most plugins. Each section below has the details:

- **Sidebars:** entry slugs are page paths, options are validated at startup, and `maxDepthNesting` is renamed `maxGroupLevels`. See [Sidebar breaking changes in 4.0.0](#sidebar-breaking-changes-in-400).
- **LaTeX Compile:** tex diagrams are inline SVGs, blocks can only `\input` files from `texInputDirs`, tex compile errors fail `astro build`, and a Markdown processor other than `unified()` or `satteri()` fails startup. See [LaTeX Compile](#latex-compile).
- **`remarkGfmSlug`** is replaced by the `astroVscodeHeadingIds` integration. See [VS Code Heading IDs](#vs-code-heading-ids).
- **`rehypeValidateLinks` and `astroNormalizePaths`** are replaced by `astroLocalLinks`. See [Local Links](#local-links).
- **`syncDocsToPublic`** is renamed `astroServeDocsFiles` and no longer copies files into `public/`. See [Serve Docs Files](#serve-docs-files).
- **Styles:** `styles/main.scss` is gone. Plugins ship their own styles, and the rest is split into two opt-in stylesheets. See [Styles](#styles).
- Plugins that read frontmatter fail at startup (or the build) when it can't be parsed.

## Plugins

### Starlight Index-Only Sidebar

Automatically generates a nested Starlight sidebar by recursively scanning directories for index files. Only directories with index files appear in the sidebar, creating a clean, minimal navigation structure.

Upgrading from 3.x? See [Sidebar breaking changes in 4.0.0](#sidebar-breaking-changes-in-400).

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightIndexOnlySidebar } from "starlight-cannoli-plugins/starlight-index-only-sidebar";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightIndexOnlySidebar({
          directories: ["guides", "api", "tutorials"],
          maxGroupLevels: 2, // optional
          dirnameDeterminesLabels: false, // optional
        }),
      ],
    }),
  ],
});
```

Import it from its subpath, as above, so your config doesn't load other plugins' dependencies. The package root still exports it too.

**Features:**

- Recursively scans directories for index files and creates sidebar entries only for pages with index files
- Index files can be `index.md`, `index.mdx`, or `index.mdoc` when `@astrojs/markdoc` is in Astro's `integrations`. Without Markdoc, an `index.mdoc` doesn't count. A `_`-prefixed file is never an index, but a `_`-prefixed folder (like `_partials/index.md`) still counts, as in Astro.
- Respects frontmatter: `draft: true` and `sidebar.hidden: true` hide an index and its whole subtree, in `astro dev` and `astro build` alike. Drafts are hidden in dev on purpose, unlike Starlight, which renders draft pages in dev: the dev sidebar shows what the build will show. A hidden root index drops its root group. `pagefind: false` only affects search and doesn't hide anything.
- Automatically collapses single-child groups (no intermediate wrappers)
- Group levels limited by `maxGroupLevels`; deeper index files are flattened
- Two labeling modes: directory names, or Starlight's `sidebar.label` then `title` from frontmatter
- Shows Starlight's `sidebar.badge` frontmatter on entries (a string gets the `default` variant)
- Ignores `assets` directories entirely
- Fails `astro dev` and `astro build` at startup when an option is bad (see **Startup errors**), an index file's frontmatter can't be parsed, or a directory under it can't be read

**Options:**

- `directories` (required): Array of directory names to scan, relative to the docs root (`content/docs/` under Astro's `srcDir`, so `src/content/docs` by default), e.g. `["guides", "api"]`. Each one becomes a top-level group.
- `maxGroupLevels` (optional, default: unlimited): The most levels of groups, the root group included. `1` puts everything flat under the root group, `2` keeps one level of nested groups, and so on. At the limit, deeper sidebar indexes are flattened into the deepest group. Must be an integer of at least 1.
- `dirnameDeterminesLabels` (optional, default: `true`): When `true`, all labels use raw directory names. When `false`, slug item labels come from frontmatter `sidebar.label`, then `title`, then `"Overview"`; group labels still use directory names. `sidebar.badge` shows on entries either way.

**Startup errors:**

These fail `astro dev` and `astro build` at startup, with a message naming the plugin and the bad value:

- a `directories` entry that resolves outside the docs root (e.g. `"../x"`)
- a `directories` entry that doesn't exist ("Directory not found")
- the same directory listed twice (e.g. `"guides"` and `"./guides/"`)
- a `directories` entry with no sidebar index (`index.md`, `index.mdx`, or `index.mdoc` when Markdoc is installed)
- a `maxGroupLevels` that isn't an integer of at least 1, `Infinity` and `null` included (leave it unset for unlimited)

**Slugs:**

Each entry links to the page Starlight serves for its index file. The slug is the index's frontmatter `slug:` when it has one. Otherwise it's the file's page path, relative to the docs root: each path segment is slugified the way Starlight does it, the extension is dropped, and a trailing `/index` is dropped. So `guides/Getting Started/index.md` gets the slug `guides/getting-started`, also when `directories` lists `"guides/Getting Started"`.

### Starlight Index-Sourced Sidebar

Generates a Starlight sidebar by parsing the markdown links out of each directory's sidebar index (its `index.md`, `index.mdx`, or `index.mdoc`). Instead of scanning the filesystem for every index file, this plugin reads the links written in each sidebar index and uses those to build the sidebar, giving you explicit, author-controlled navigation with automatic nesting.

Upgrading from 3.x? See [Sidebar breaking changes in 4.0.0](#sidebar-breaking-changes-in-400).

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightIndexSourcedSidebar } from "starlight-cannoli-plugins/starlight-index-sourced-sidebar";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      plugins: [
        starlightIndexSourcedSidebar({
          directories: ["guides", "reference"],
          maxGroupLevels: 2, // optional
          indexMarker: { text: "Index", variant: "note" }, // optional
          collapsed: false, // optional
          linkScope: "below", // optional
        }),
      ],
    }),
  ],
});
```

Import it from its subpath, as above, so your config doesn't load other plugins' dependencies (like the optional peer `@expressive-code/core`). The package root still exports it too.

**Example `index.md`:**

```markdown
---
title: Guides
---

- [Getting Started](./getting-started)
- [Configuration](./configuration)
- [Advanced Topics](./advanced/index)
- [Showcase](./showcase/)
```

**Features:**

- Builds sidebar entries from the links written in each directory's sidebar index. A group's entries are, in order: the sidebar index's own entry, then one entry per link, in the order written.
- Sub-index links (`./sub/index` or `./sub/`) create nested sub-groups, recursed automatically, whatever the target sidebar index's extension (`index.md`, `index.mdx` or `index.mdoc`)
- Leaf indexes: a sidebar index with `indexSourcedSidebar: { leaf: true }` in its frontmatter becomes a single entry (see [Leaf indexes](#leaf-indexes))
- Group levels limited by `maxGroupLevels`; deeper items are flattened
- A directory or page linked from several sidebar indexes appears under each of them, and the same link written twice in one sidebar index gives two entries. A sub-index link to a sidebar index already in the current chain is skipped with a warning, so a loop between sibling directories (`guides/` links `../shared/`, which links `../guides/`) can't hang startup.
- Labels and badges come from Starlight's sidebar frontmatter (see **Labels and badges**)
- Source docs (sidebar indexes and linked pages) are `.md`, `.mdx`, and `.mdoc` when `@astrojs/markdoc` is in Astro's `integrations`. Without Markdoc, a `.mdoc` file is a docs asset and a link to it is skipped like a link to a PDF.
- Respects frontmatter: `draft: true` and `sidebar.hidden: true` hide an entry, in `astro dev` and `astro build` alike. Drafts are hidden in dev on purpose, unlike Starlight, which renders draft pages in dev: the dev sidebar shows what the build will show. A hidden sidebar index drops its whole group, and a hidden root sidebar index drops its root group without an error. `pagefind: false` only affects search and doesn't hide anything.
- A link to a `_`-prefixed file (like `./_partial.md`) gives no entry, since Astro never makes it a page, and logs a warning naming the sidebar index and the link. Only the filename counts: a page in a `_`-prefixed folder (like `./_partials/shared`) still gets an entry.
- A link to a source doc that doesn't exist logs a warning naming the sidebar index and the link, so typos don't go unnoticed (see **Link conventions**)
- Fails `astro dev` and `astro build` at startup when an option is bad (see **Startup errors**), or a sidebar index or linked page can't be read or its frontmatter can't be parsed

**Options:**

- `directories` (required): Array of directory names to scan, relative to the docs root (`content/docs/` under Astro's `srcDir`, so `src/content/docs` by default). Each one must have a sidebar index and becomes a top-level group.
- `maxGroupLevels` (optional, default: unlimited): The most levels of groups, the root group included. `1` puts everything flat under the root group, `2` keeps one level of nested groups, and so on. A sub-index link whose group would go past the limit has its entries flattened into the parent group. Must be an integer of at least 1.
- `indexMarker` (optional, default: `undefined`): A Starlight badge (`{ text, variant }`) shown on every index entry to tell it apart from regular sidebar entries. When set, it replaces an index entry's own `sidebar.badge`. `variant` is one of `"note"`, `"tip"`, `"caution"`, `"danger"`, `"success"` or `"default"`. Example: `{ text: "Index", variant: "note" }`.
- `collapsed` (optional, default: `true`): Whether sidebar groups start collapsed. Starlight still expands the group holding the current page.
- `linkScope` (optional, default: `"anywhere"`): Where a sidebar index's links may point. `"anywhere"` keeps links to anywhere in the docs root. `"below"` keeps only links inside the linking sidebar index's own directory, so from `guides/index.md`, `./setup`, `./advanced/` and `/guides/setup` count, but `../reference/` and `/reference/faq` are skipped with a warning. Links to the sidebar index's own directory or an ancestor directory are skipped with a warning either way (see **Link conventions**).

**Startup errors:**

These fail `astro dev` and `astro build` at startup, with a message naming the plugin and the bad value:

- a `directories` entry that resolves outside the docs root (e.g. `"../x"`)
- a `directories` entry that doesn't exist ("Directory not found")
- the same directory listed twice (e.g. `"guides"` and `"./guides/"`)
- a `directories` entry with no sidebar index (`index.md`, `index.mdx`, or `index.mdoc` when Markdoc is installed)
- a `maxGroupLevels` that isn't an integer of at least 1, `Infinity` and `null` included (leave it unset for unlimited)
- a `linkScope` that isn't `"anywhere"` or `"below"`

**Link conventions:**

- Links to sub-sections are sub-index links: they end in `/index` (with or without an extension) or `/`, e.g. `[Subtopic](./subtopic/index)` or `[Subtopic](./subtopic/)`. The plugin recurses into the target's sidebar index unless it's a leaf index.
- A link to the sidebar index's own directory, or to any directory above it up to the docs root, gives no entry and logs a warning. That covers the directory itself and its sidebar index. From `guides/advanced/index.md`, `.`, `./`, `..`, `../`, `../index.md`, `../../`, `/` and `/guides/` are all skipped this way, and so is `/docs` on a site with base `/docs`. This holds whether or not the directory is one of the sidebar indexes above in the sidebar, so a root group for `guides/advanced` never expands `guides/` from a `..` link. A link that goes up and then sideways or down, like `../setup.md` or `../../reference/`, still counts.
- A folder link (`./subtopic/`) whose folder has no sidebar index logs a warning and adds nothing. It doesn't fall back to a sibling `subtopic.md`.
- All other links to source docs become flat page entries
- Links are found by parsing the markdown body, whatever the sidebar index's extension

Link forms that count:

- Relative file-form links, with or without the extension: `./setup`, `./setup.md`, `../other/page`. A file whose name has a dot in it works either way: `./v1.2` reaches `v1.2.md` when there's no file named `v1.2`.
- Root-absolute links, resolved against the docs root: `/guides/setup`. On a site with a `base` (say `/docs`), a link that starts with it has it stripped first, so `/docs/guides/setup` works too.
- Percent-encoded links, which are decoded: `./my%20page` reaches `my page.md`
- Reference-style links, through their definitions: `[Setup][setup]`, `[Setup][]` or `[Setup]` with `[setup]: ./setup` somewhere in the file. Entries follow the order the references appear, not the definitions.
- Query strings and anchors are stripped: `./setup#intro` reaches `setup.md`

Link forms that don't count:

- JSX and HTML links, like `<Card href="./setup">` or `<a href="./setup">`. In an MDX index, write a markdown link instead.
- Page-form links, like `./my-page/` for `My Page.md`. A link ending in `/` is always a sub-index link. Write the file-form link `./My%20Page` (or `<./My Page>`) instead.

Skipped silently:

- External links: any `scheme:` link (`https:`, `mailto:`, `tel:`, `ftp:`, ...) and protocol-relative `//` links
- Same-page anchors (`#section`)
- Links to docs assets: links with an extension that isn't a source doc extension, when that exact file exists (images, PDFs, etc.). So `./manual.pdf` never reaches `manual.pdf.md` while `manual.pdf` exists. When no such file exists, each source doc extension is tried instead, and the link warns if none of them exists either.
- Links to pages hidden from sidebar (`draft: true` or `sidebar.hidden: true`)

Skipped with a warning naming the sidebar index and the link:

- A link to a source doc that doesn't exist
- A link that resolves outside the docs root (`../../x.md`, `/../x`)
- A link to a `_`-prefixed file
- A folder link whose folder has no sidebar index
- A link to the sidebar index's own directory or an ancestor directory (`.`, `..`, `../index.md`, `/`)
- A sub-index link to a sidebar index already in the current chain (a loop)
- With `linkScope: "below"`, a link outside the sidebar index's own directory

These are only warnings. If you also use [`astroLocalLinks`](#local-links), broken links keep failing there, on the final HTML.

#### Leaf indexes

A landing page full of components can opt out of driving navigation. Mark its sidebar index as a leaf index:

```markdown
---
title: Showcase
indexSourcedSidebar:
  leaf: true
---
```

A sub-index link to a leaf index gives a single entry carrying the index marker, and the leaf index's own links don't affect the sidebar. The leaf key is ignored on a root sidebar index, so a listed directory always expands.

**Labels and badges:**

- Index entries and page entries are labelled with the source doc's `sidebar.label`, then its `title`, then a label made from its filename (or its directory name, for an index)
- Groups, the root group included, are always labelled from their directory name (e.g. `csci-316` becomes `CSCI 316`)
- A page entry shows its `sidebar.badge`. A string badge gets the `default` variant
- An index entry shows `indexMarker` when one is set, and otherwise its own `sidebar.badge`

**Slugs:**

Each entry links to the page Starlight serves for its source doc. The slug is the doc's frontmatter `slug:` when it has one. Otherwise it's the doc's page path, relative to the docs root: each path segment is slugified the way Starlight does it, the extension is dropped, and a trailing `/index` is dropped. So `reference/My Page.md` gets the slug `reference/my-page`, and `reference/advanced/index.md` gets `reference/advanced`.

#### Sidebar breaking changes in 4.0.0

These apply to both sidebar plugins unless marked otherwise.

- **`maxDepthNesting` is renamed to `maxGroupLevels`**, with no alias. It now counts levels of groups with the root group included, and leaving it unset means unlimited (the old default was `100`).
  - `starlightIndexSourcedSidebar`: use the same number. `maxDepthNesting: 2` becomes `maxGroupLevels: 2`. The old `0` behaved like `1`, so use `1`.
  - `starlightIndexOnlySidebar`: add one. `maxDepthNesting: 1` becomes `maxGroupLevels: 2`, and `maxDepthNesting: 0` becomes `maxGroupLevels: 1`.
- **Bad options and missing directories fail startup** (see **Startup errors** in each section). A `maxGroupLevels` that isn't an integer of at least 1 fails, and so does a `directories` entry that's outside the docs root, doesn't exist, has no sidebar index, or is listed twice. The docs root is now `content/docs/` under Astro's `srcDir`, not `src/content/docs` relative to the working directory.
- **Slugs are page paths.** Each segment is slugified the way Starlight does it, so `My Page.md` links to `/my-page/`, and a frontmatter `slug:` override is honoured. Entries used to carry the raw file path, which Starlight rejected for non-slug filenames.
- **Labels prefer `sidebar.label`.** Entry labels are now `sidebar.label`, then `title`, then the filename (for `starlightIndexOnlySidebar`, only with `dirnameDeterminesLabels: false`). Entries also show `sidebar.badge` now.
- **`pagefind: false` no longer hides entries** (`starlightIndexSourcedSidebar`). It only keeps a page out of search, as in Starlight. Use `sidebar.hidden: true` to hide an entry. `draft: true` and `sidebar.hidden: true` still hide, in dev and build alike.
- **`index.mdx` sub-indexes now expand** (`starlightIndexSourcedSidebar`). A sub-index link to `index.mdx` used to become a single entry, and now expands into a nested group like `index.md`. To keep the old behaviour, add `indexSourcedSidebar: { leaf: true }` to the `index.mdx` frontmatter (see [Leaf indexes](#leaf-indexes)).
- **More links count, and repeats are kept** (`starlightIndexSourcedSidebar`). Folder links (`./sub/`), root-absolute links (`/guides/setup`) and percent-encoded links (`./my%20page`) used to be dropped silently and now add entries. A directory linked from two sidebar indexes used to appear only under the first, and now appears under both. Broken links now log a warning instead of vanishing. Links to the sidebar index's own directory or an ancestor directory (`.`, `..`, `../index.md`, `/`) give no entry and warn.
- **`indexMarker` docs are corrected** (`starlightIndexSourcedSidebar`). It was documented as a string prepended to the label, but it has always been a `{ text, variant }` badge. If you passed a string, pass `{ text: "★", variant: "default" }` instead.
- **Subpath imports.** `starlightIndexSourcedSidebar` now has its own subpath export, `starlight-cannoli-plugins/starlight-index-sourced-sidebar`, like `starlightIndexOnlySidebar` (`starlight-cannoli-plugins/starlight-index-only-sidebar`). Importing from the package root still works, but it loads every plugin's dependencies, so switch to the subpath.

### LaTeX Compile

Automatically compiles fenced `tex compile` and `latex compile` code blocks to SVG diagrams during the build process. Uses `pdflatex` and `dvisvgm` for high-quality, cached SVG output, inlined into the page as `<svg>` elements.

**Features:**

- Compiles LaTeX/TikZ code blocks to SVG automatically
- Inlines each compiled tex diagram into the page, with its text selectable and searchable (see [Compile mode](#compile-mode))
- Optional zoom button that opens the diagram in a modal with zoom controls (see [Zoom view](#zoom-view))
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

It works with both of Astro's Markdown processors, `unified()` and `satteri()`, and adds itself to whichever one is configured, so `.md` and `.mdx` docs need no extra config. Before Astro 7 it adds itself to `markdown.remarkPlugins`. Its position in `integrations` doesn't matter. `astro dev` and `astro build` fail at startup if `markdown.processor` is some other processor, or if an integration listed after it replaces the processor.

Markdoc (`.mdoc`) doesn't run Markdown processor plugins, so `tex compile` blocks in it stay code blocks.

**Options:**

- `svgOutputDir` (required): Directory where compiled SVG files are written. Resolved against the project root, and must be a subdirectory of Astro's `publicDir` (usually `public/`), or Astro fails to start. Each block's SVG is written here as `<hash>.svg` and reused while the block is unchanged. Pages inline the SVG rather than linking to these files.
- `removeOrphanedSvgs` (optional, default: `false`): When `true`, SVG files that are no longer referenced by any `tex compile` block are deleted automatically. On build, every orphaned tex diagram is swept at the end. In dev, docs that weren't edited aren't re-rendered (Astro's content cache stays on to keep dev fast), so the plugin can't see what they reference: only compiled tex diagrams first written during the current dev session are deleted when a block is edited, and older orphaned tex diagrams stay until the next build.
- `svgClassname` (optional): Default CSS class(es) applied to every compiled tex diagram's inline `<svg>` element. Individual blocks can override this with a `class` meta option. The `tex-compiled` class is always present and cannot be overridden.
- `texInputDirs` (optional): Directories, resolved against the project root, that `tex compile` blocks can pull tex input files from with `\input{}`, `\include{}`, `\usepackage{}`, `\includegraphics{}` and similar. End an entry with `//` to search its subdirectories too, as in `TEXINPUTS` ([subdirectory expansion](https://tug.org/texinfohtml/kpathsea.html#Subdirectory-expansion)). Multiple directories are supported, including ones outside the project. Apart from TeX's installed packages, these are the only files a block can read, and only by a path relative to a tex input dir (`\input{macros}`, `\input{tikz/arrows}`). A path starting with `./`, a path relative to the project like `\input{src/latex/macros}`, an absolute path, a path using `..`, or a dotfile doesn't resolve.
  - When any file in these directories or their subdirectories changes, every compiled tex diagram is recompiled, including blocks that don't use that file. In `astro dev` this happens on its own: the dev server restarts and re-renders every doc. A file added while dev is running is only watched after the next restart. Symlinked files and directories are followed. Dotfiles, dot-dirs and LaTeX build artifacts (`.aux`, `.log`, `.synctex.gz`, ...) don't count.
  - An error inside one of these files is reported with that file's path and line, e.g. `Error (src/latex/macros.tex:2): Undefined control sequence.`
  - If you build in an environment without TeX, relying on committed SVGs, commit the files in these directories too. A build hashes them to find the right SVGs.
  - A directory that doesn't exist fails `astro dev` at startup. `astro build` only warns, since git doesn't keep empty directories, and names the directory if the build then fails because TeX is missing.
- `zoom` (optional, default: `false`): When `true`, every compiled tex diagram gets a zoom button that opens its [zoom view](#zoom-view). Individual blocks can override this with a `zoom` or `zoom=false` meta option.
- `debug` (optional): `true`, or `{ outputDir?, logFile? }`. When set, a debug tex diagram image (a JPEG copy of each compiled tex diagram) is written to `debug.outputDir` as a flat file list (no mirrored folder structure). Both paths are relative to the integration's codegen dir, `.astro/integrations/astro-latex-compile/`, and default to `debug-images/` and `latex-compile.log`; an empty path, an absolute path, or one that leads outside that dir fails at startup. The resolved image dir is logged when Astro starts. Only blocks that carry a `blockid=<n>` meta option produce a debug tex diagram image — blocks without it are ignored. The filename format is `<originating-file>--<blockid>-<8-char-dir-checksum>.jpg` (e.g. `tex-test--5-a1b2c3d4.jpg`), where the checksum is an MD5 hash of the originating file's directory, namespacing files so that same-named files from different directories don't collide. Debug tex diagram images are deleted automatically when their block is removed, its `blockid` changes, or its content changes, and every debug tex diagram image in `debug.outputDir` is cleared at the start of a build. If two blocks in one doc share a `blockid`, a warning is logged (even with `debug` off) and only the last block's debug tex diagram image is kept. Every debug tex diagram image (re)write is also appended to `debug.logFile`, which rotates automatically once it grows too large (rolling backups `<logFile>-1.log`, `<logFile>-2.log`, etc.). Compiled tex diagrams are unaffected — the debug output is complementary and intended for local inspection. Its type is exported as `LatexCompileDebugOptions`.

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

**Migrating `texInputDirs` from 4.1:**

- Files in subdirectories of an entry without `//`, and symlinked files and directories, now count toward every compiled tex diagram's hash. A block could already read them (`\input{tikz/arrows}`), but editing them left its compiled tex diagram stale.
- If a tex input dir holds such files, every compiled tex diagram's hash changes once. If your deploy builds without TeX, run `astro build` locally and commit the new SVGs before deploying.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroLatexCompile } from "starlight-cannoli-plugins/astro-latex-compile";

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

Use either ` ```tex compile ` or ` ```latex compile ` — both work identically. `compile` has to be its own meta option: a `tex` block that only mentions it inside another one (`alt="compiled flow"`), or sets `compile=false`, stays a plain code block.

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

**Meta options:**

The following meta options can be added to the opening fence:

- `class="..."`: CSS classes applied to the resulting `<svg>` element (space-separated). The `tex-compiled` class is always included. A bare `class` with no value is a tex compile error.
- `alt="..."`: Accessible label for the resulting `<svg>` element, set as `role="img"` and `aria-label`. Defaults to `"LaTeX diagram"` if omitted. A bare `alt` with no value is a tex compile error; quote a label that reads `true` or `false`.
- `mode=dvi` or `mode=pdf`: The block's [compile mode](#compile-mode). Defaults to `dvi`.
- `zoom` or `zoom=false`: Turns the [zoom view](#zoom-view) on or off for this block, overriding the `zoom` option. `zoom=true` works too; any other value is a tex compile error.
- `blockid=<n>`: Names the block's debug tex diagram image (see the `debug` option). `<n>` must be a whole number (`0` or more); anything else is a tex compile error.

Giving any of these, or `compile`, more than once is a tex compile error, and one tex compile error lists every invalid meta option on the block. Meta options the plugin doesn't know, such as `title=`, are ignored.

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

Each compiled tex diagram's ids, classes and fonts are prefixed with its hash, so several can share a page. Compiled tex diagrams are sized in `em`, so 10pt LaTeX text matches the surrounding body text and follows the reader's browser font size. Wide ones shrink to fit the content column (`max-width: 100%`).

#### Zoom view

With `zoom: true`, or `zoom` on a block, the compiled tex diagram gets a small zoom button above its top-right corner, in the gap between the diagram and the content before it (above the right edge of the content column in browsers without CSS `anchor-scope`). The button shows on hover and on keyboard focus, and always on touch devices. The button opens a full-screen modal that hides the page, with a copy of the diagram at the size it has on the page. Sizing classes like `w-50` count toward that size, but the copy never sizes itself against the modal. The controls float at the top right and the caption at the bottom:

- `−` and `+` zoom from 1× to 8×, in 1.25× steps, and the percentage between them resets to 1×. The keys `-`, `+` (or `=`) and `0` do the same.
- A diagram larger than the screen scrolls. In `dvi` mode its text stays selectable.
- The block's `alt` shows as a caption under the diagram. A block without its own `alt` has no caption.
- `×`, Esc or a click beside the diagram closes it.

````markdown
```tex compile zoom alt="A binary tree"
\documentclass[border=5pt]{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
  \node {A} child {node {B}} child {node {C}};
\end{tikzpicture}
\end{document}
```
````

The diagram is wrapped in a `<div class="tex-zoom-frame">` that spans the content column, so the `<svg>` and its `class=` lay out as before. To make room for the button, every compiled tex diagram, zoom or not, gets a top margin of `--sl-content-gap-y` (`1rem` without Starlight) plus `0.25rem`, even as the first child of its container. Labels are in English.

**Migrating to inline SVGs:** every compiled tex diagram's hash changes once, so every block recompiles on the first build. With `removeOrphanedSvgs`, the build removes the old SVGs; otherwise delete them from `svgOutputDir` by hand. If your deploy builds without TeX, run `astro build` locally and commit the new SVGs before deploying.

### VS Code Heading IDs

An Astro integration that gives each heading in your Markdown and MDX the same id VS Code gives it. A `[text](./other.md#some-heading)` link you can ctrl+click in the editor then lands on the right heading on the site too.

Astro builds heading ids from the rendered HTML, so they differ from VS Code's for some headings. The usual case is inline math: with KaTeX, `## Big $O(n^2)$ time` gets an id like `big-on2on2on2-time`, built from KaTeX's output, while VS Code expects `big--time`.

It follows VS Code with its default settings, which include math support:

- The id is built from the heading's text. Bold, inline code and link text count, and so does image alt text.
- Math and inline HTML tags are left out. A heading that's only math gets an empty id.
- Ids are lowercased, punctuation is dropped and spaces become `-`. Duplicates get `-1`, `-2` and so on.
- A heading that already has an id (from another plugin) keeps it.

It works with both of Astro's Markdown processors, `unified()` and `satteri()`, and adds itself to whichever one is configured. With Sätteri, turn on `features.math` if you use math: otherwise `$x$` is plain text and stays in the id. Its position in `integrations` doesn't matter. `astro dev` and `astro build` fail at startup if `markdown.processor` is some other processor, or if an integration listed after it replaces the processor.

Markdoc (`.mdoc`) doesn't run Markdown processor plugins, so its headings keep Markdoc's ids.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { astroVscodeHeadingIds } from "starlight-cannoli-plugins/astro-vscode-heading-ids";

export default defineConfig({
  integrations: [astroVscodeHeadingIds()],
});
```

**Migrating from `remarkGfmSlug`:** the `remark-gfm-slug` export is gone. Remove `remarkGfmSlug` from `markdown.remarkPlugins` and add `astroVscodeHeadingIds()` to `integrations`. Ids now keep image alt text and drop inline HTML, so links to headings like that change.

### Local Links

An Astro integration for the local links in your docs, meaning Markdown links (`[text](./other)`, `![alt](/img/logo.png)`) that to some other local file. It also handles `<a href>` and `<img src>` elements you write directly in your Markdown or MDX. It does two things, each of which you can turn off:

- **Link validation** fails on a local link in a page's content whose target doesn't exist.
- **Link normalization** rewrites relative links (`./other`, `../ref/page`) to root-absolute ones (`/guide/other`). A relative link in the HTML is resolved against the page's URL, so it can point somewhere different depending on whether your host adds a trailing slash. After normalization, a link means the same thing everywhere, and it matches what your editor opens on ctrl+click. It also rewrites a link to a source doc's file path, like `./List%20Syntax` for `List Syntax.md`, to the page path Starlight serves it at (`/guide/list-syntax`). A rewritten link keeps your trailing slash or lack of one, and any `?query#fragment`, so `./other/` becomes `/guide/other/`.

**Why write relative links at all?** Starlight's own docs write internal links as root-absolute URLs like `/guide/other/`. Those links work on the site, but if you write them in that manner, your editor and GitHub can't follow them back to the source file, because `/guide/other/` is a URL and not a file path. Relative links have the opposite problem: your editor follows them, but in the built HTML the browser resolves them against the page's URL, not its source file, and there exists no trailing-slash setting that makes it work for every page. With trailing slashes, `guide/intro.md` is served at `/guide/intro/`, so `./other` lands on `/guide/intro/other`. Without them, `guide/index.md` is served at `/guide`, so `./other` lands on `/other`. Link normalization lets you write links the way your editor reads them and still get links that work on the site.

Both run on each page's final HTML, in dev and in build. That means they cover Markdown links, raw HTML in `.md`, JSX in `.mdx` (including `src={...}` expressions) and HTML rendered by components.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroLocalLinks } from "starlight-cannoli-plugins/astro-local-links";

export default defineConfig({
  integrations: [astroLocalLinks(), starlight({ title: "My Docs" })],
});
```

**Options:**

- `validate` (optional, default: `true`): `false` turns link validation off. Pass `{ skipPatterns: [...] }` to skip links that match any of the glob patterns (see below).
- `normalize` (optional, default: `true`): `false` turns link normalization off.

**What counts as an existing target:**

- A source doc. `/reference/schemas` matches `reference/schemas.md(x)` or `reference/schemas/index.md(x)`. Source docs are `.md`, `.mdx`, and `.mdoc` when `@astrojs/markdoc` is in Astro's `integrations`. `/reference/schemas/index` matches the latter too, as a file-form link (see [Non-slug filenames](#non-slug-filenames)), so link normalization rewrites it to `/reference/schemas`.
- A source doc by its file path, when its filename isn't a slug. See [Non-slug filenames](#non-slug-filenames) below.
- A file the site serves, like `/static/img/logo.png`. In `astro build` that's any file in the build output: files from `public/`, docs files that [Serve Docs Files](#serve-docs-files) serves, and whatever other integrations write. In `astro dev` it's a file in `public/`, or a file under `src/content/docs/` that Serve Docs Files would serve. Local Links finds Serve Docs Files by its integration name in Astro's `integrations` and uses the same served-file rule, so `_`- or `.`-prefixed files and `ignorePatterns` matches fail in dev just as they would in a build. A raw doc link to a draft passes in dev, where Serve Docs Files serves drafts, and fails in a build. Without Serve Docs Files installed, only `public/` counts in dev.

A file that sits next to your docs in `src/content/docs/` (a PDF, an image) only counts if the site serves it, because otherwise its URL would 404. [Serve Docs Files](#serve-docs-files) does that for you.

That includes source docs themselves. A link with the doc's extension, like `./auto-list-syntax.md`, is a **raw doc link**: it sends readers to the raw Markdown, not to the page built from it. It's never rewritten to the page path, so it only passes if the raw doc is served (a draft, for instance, isn't in a build). If it isn't, the error says so and names the link to use for the page instead. To link to the page, drop the extension.

Pages that aren't rendered from a source doc, like `src/pages/*.astro` routes, can't be checked. Link to them with one of the skips below.

**When it fails:**

- `astro build` checks every page, then fails once with a list of every broken local link, grouped by source doc.
- `astro dev` shows the broken links on the page's error screen when you open it.
- Two source docs with the same page path fail the build before any page is checked. See [Non-slug filenames](#non-slug-filenames).

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
- Server-rendered Starlight (`prerender: false`) isn't supported, since there's no built HTML to check. `astro build` fails if Starlight wrote no doc pages while `src/content/docs/` has source docs. A site whose source docs are all drafts hits this error too, as a false alarm. The build also fails if Starlight's doc route is missing entirely, such as when Starlight isn't in `integrations`.
- A page, redirect or endpoint at a source doc's page path (such as one in `src/pages`) shadows that source doc: Astro serves it instead, and the source doc can't be reached. `astro dev` errors on that page, and `astro build` fails, listing every shadowed doc. This includes drafts, which become unreachable as soon as they stop being drafts. Astro also logs its own route conflict warning in `astro build`, and with `prerenderConflictBehavior: 'error'` Astro fails the build before this check runs. Setting it to `'ignore'` doesn't turn this check off. To serve a page in place of a source doc, delete the source doc or prefix its file name with `_`. With [Serve Docs Files](#serve-docs-files) installed, `astro build` leaves its `/[...path]` route out of this check, since that plugin reports those clashes itself.
- A frontmatter `slug` and a custom `docsLoader({ generateId })` aren't supported. See [Non-slug filenames](#non-slug-filenames).

**Migrating from `rehypeValidateLinks` and `astroNormalizePaths`:**

Both are replaced by `astroLocalLinks` and now throw when called. Remove `rehypeValidateLinks` from `markdown.rehypePlugins` and `astroNormalizePaths()` from `integrations`, then add `astroLocalLinks()`. `rehypeValidateLinks`' `skipPatterns` moves to `astroLocalLinks({ validate: { skipPatterns } })`.

#### Non-slug filenames

Starlight serves each source doc at its page path, made by slugifying each segment of its file path. So `reference/List Syntax.md` is served at `/reference/list-syntax/`, and `My Guide/Intro.md` at `/my-guide/intro/`. You can link to a doc like that in two ways, and both pass link validation:

- **Page-form link**, the URL readers see: `/reference/list-syntax/`, or `./list-syntax` from a sibling doc.
- **File-form link**, the file path without its extension, URL-encoded: `./List%20Syntax`, or `/reference/List%20Syntax`. Your editor can follow these to the file.

Link normalization rewrites file-form links to the page path, URL-encoded where needed, so readers don't hit a 404. As with any rewritten link, your trailing slash and `?query#fragment` are kept. With link normalization off, a file-form link is reported as broken, and the error names the page path to link to instead. A skip pattern skips a file-form link if it matches either its file form or its page path.

A link has to be exactly one of the two forms. One that only matches once slugified, like `/reference/LIST-syntax`, is broken, since hosts serve only the exact page path.

Slug filenames (`list-syntax.md`) are still simpler, because then the two forms are the same link. Non-slug filenames are there for files you'd rather not rename, like ones imported from a notes vault.

Two source docs with the same page path, like `Foo.md` and `foo.md`, `a b.md` and `a-b.md`, or `x.md` and `x/index.md`, are a page path collision. `astro build` fails before checking any page, listing every collision and its files, so you know which to rename. `astro dev` only errors on the colliding page and pages whose content links to it.

Page paths are worked out the way Starlight's docs loader does it by default. A frontmatter `slug` and a custom `docsLoader({ generateId })` change where Starlight serves a page, so they aren't supported. Pages that use them usually can't be matched to their source doc, and the integration throws.

### Serve Docs Files

Serves every file in the docs directory (`src/content/docs/`) at its path there, so a PDF or image next to a doc, or a doc's raw Markdown, can be linked to. `reference/paper.pdf` is served at `/reference/paper.pdf`, and `reference/List Syntax.md` at `/reference/List Syntax.md`, byte-for-byte with its frontmatter.

It does this through one prerendered `/[...path]` route that it adds to the site. In `astro dev` each file is read from its source on every request, so a saved edit shows up straight away. A file added during the session is served, and a deleted one 404s, without restarting the dev server. In `astro build` Astro writes each one into the build output like any other page. Nothing is copied into `public/` or deleted from it, so `public/` only holds the files you put there.

**What's served:**

- Every file under the docs directory, with a content type from its extension (source docs and other Markdown files, like `.markdown`, as `text/markdown`, unknown ones as `application/octet-stream`). Source docs are `.md`, `.mdx`, and `.mdoc` when `@astrojs/markdoc` is in Astro's `integrations`.
- Except any file or directory whose name starts with `_` or `.` (like `_partial.md`, `_assets/` or `.obsidian/`) along with everything under one, and files matching `ignorePatterns`. Docs with `sidebar.hidden` are still served.
- Files and directories with `?` or `#` in their name aren't served either. Astro decodes request paths with `decodeURI`, which leaves `%3F` and `%23` encoded, so no request reaches such a file. A source doc like `Why? #1.md` still gets its page, just no raw doc.
- Drafts (`draft: true`) are served in `astro dev` only, the same way Starlight renders a draft's page in dev and leaves it out of the build. `astro build` leaves them out, but files next to a draft are still served.
- `astro dev` and `astro build` fail at startup when a source doc's frontmatter can't be parsed, since the plugin can't tell whether the file is a draft. Once `astro dev` is running, saving such a file only logs an error, so the dev server keeps running. That file isn't served until its frontmatter is fixed, and a link to it fails [Local Links](#local-links)' dev check.
- The docs directory is read from Astro's `srcDir`, so a custom `srcDir` works.
- `astro build` fails when a docs file and another route (a Starlight page, a `src/pages` route, another integration's route) write the same output file or render the same URL, such as an extensionless `reference/bar` next to `reference/bar.md`, a `reference/index.html` next to `reference/index.md`, or a docs `zap/index.html` next to `src/pages/zap.astro`. Astro on its own only warns about some of these, dropping one page, and silently overwrites a file in the rest. The error lists every clash and both routes, whatever `build.format` is. `astro dev` doesn't check for these. Clashes at the same URL are found from Astro's own warning, so with `prerenderConflictBehavior: 'ignore'` Astro logs nothing and they go unreported. The build then warns at startup that it can't detect them.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroServeDocsFiles } from "starlight-cannoli-plugins/astro-serve-docs-files";

export default defineConfig({
  integrations: [astroServeDocsFiles(), starlight({ title: "My Docs" })],
});
```

**Options:**

- `ignorePatterns` (optional): Glob patterns for files not to serve. Patterns are matched against paths relative to `src/content/docs/`. A pattern that matches a directory leaves out everything under it.
- `exposePageSrcButton` (optional, default: `false`): Injects a client-side script on every page that adds a page-action bar next to the page's `<h1>` with "Copy Page", "Copy raw URL", and "View raw" actions for the page's raw doc.
- `enableAskAiOption` (optional, default: `false`): Adds "Ask ChatGPT", "Ask Claude", and "Ask Gemini" entries to the same page-action bar, each opening the respective chat app in a new tab with a prompt pre-filled to read the page's raw doc. Independent of `exposePageSrcButton`: enabling this on its own still adds the page-action bar, with only the "Ask" entries.

**Raw doc alternate link:** every Starlight doc page whose raw doc is served gets `<link rel="alternate" type="text/markdown" href="...">` in its `<head>`, in `astro dev` and in the build output, whether or not the page-action options are on. The `href` is the raw doc's source path under Astro's `base`, URL-encoded, so `reference/List Syntax.md` (whose page path is `/reference/list-syntax/`) gets `href="/reference/List%20Syntax.md"`, or `href="/docs/reference/List%20Syntax.md"` with `base: "/docs"`. Since the raw doc's path can't be predicted from the page path, the page-action bar reads this link, and crawlers and agents that follow link relations can find the raw doc the same way. Pages whose raw doc isn't served get no raw doc alternate link and no page-action bar: drafts in `astro build`, docs that `_`/`.` prefixes, `?` or `#` in their name, or `ignorePatterns` leave out, a doc whose frontmatter stopped parsing during `astro dev`, the 404 page (a custom `404.md` too) and `src/pages` routes.

```ts
astroServeDocsFiles({
  ignorePatterns: ["**/*.txt", "**/drafts/**"],
  exposePageSrcButton: true,
  enableAskAiOption: true,
});
```

**Served-file rule:** the integration object has a `servedFileRule(docsRelativeEntryPath)` field that says whether a file or directory, given its path relative to the docs directory, is served, by the rules above. It throws on unparseable frontmatter. Astro keeps only `name` and `hooks` of each integration in `config.integrations`, so the same function is also the `astro-serve-docs-files:served-file-rule` hook. Other integrations can find this one by name (`astro-serve-docs-files`) in `config.integrations`, read that hook, and call it once `astro:config:setup` has run.

**Upgrading to 4.0.0:**

- `syncDocsToPublic` is renamed `astroServeDocsFiles` (subpath export: `starlight-cannoli-plugins/astro-serve-docs-files`).
- `preserveDirs` is removed, since the plugin no longer deletes anything from `public/`. Drop it from your config.
- `ignorePatterns` that match source docs no longer fail at startup while `exposePageSrcButton` or `enableAskAiOption` is on. Pages whose raw doc they leave out just don't get the page-action bar.
- Needs `@astrojs/starlight` 0.32 or later, since the raw doc alternate link reads Starlight's route data.
- Delete the copies the old plugin left in `public/` (everything it synced from `src/content/docs/`), and any `.gitignore` rules you added for them. Until you do, `astro dev` and `astro build` fail at startup with a served path collision error (below) that lists each one.

**Served path collisions with `public/`:** a served docs file and a file in `public/` with the same path, like `src/content/docs/reference/notes.pdf` and `public/reference/notes.pdf`, can't both be served. `astro dev` and `astro build` fail at startup with one error listing every clash and both files of each. Files the plugin doesn't serve (`_`/`.`-prefixed, `ignorePatterns` matches) never clash. A draft only clashes in `astro dev`, since `astro build` doesn't serve it. A clash created while `astro dev` is running shows the error at that URL only, and the dev server keeps running.

### Starlight DOM Patches

An Astro integration that injects a client-side script to apply opt-in DOM patches on every page. Each patch is disabled by default and must be explicitly enabled.

**Options:**

- `hideSingleLineGutters` (optional, default: `false`): Hides the line number gutter on Expressive Code blocks that contain only a single line.
- `syncTocLabelsFromHeadings` (optional, default: `false`): Copies the rendered HTML of each heading into its matching Starlight TOC anchor label, so the TOC properly reflects any custom markup (e.g. math) present in the heading.
- `limitDetailsElementHeight` (optional, default: `false`): Limits the height of expanded `<details>` elements and makes their content scrollable.
- `offerToggleAllDetails` (optional, default: `false`): Injects an "Expand All Dropdowns" toggle checkbox into the right sidebar (before `nav[aria-labelledby="starlight__on-this-page"]`). Clicking it opens or closes every `<details>` element on the page at once. Only appears on pages that contain at least one `<details>` element without the `hidden` attribute; `<details hidden>` elements are skipped.
- `offerTabbedContent` (optional, default: `false`): Injects a "Tabbed view" toggle checkbox immediately after `#starlight__on-this-page` in the right sidebar. When enabled by the user, the page's markdown content is reorganised into tabs — one per `<h2>` heading, plus an optional "Main" tab for any content that appears before the first `<h2>`. The toggle defaults to off on every page load and is not persisted. Only activates when the page has at least two sections (i.e. two or more `<h2>` elements, or one `<h2>` with pre-heading content). Has no effect on pages that lack `#starlight__on-this-page` (e.g. pages with the TOC disabled). Clicking a TOC anchor while tabs are enabled automatically switches to the tab containing the target heading. The generated elements use the classes `tabbed-content`, `tabbed-content-nav`, `tabbed-content-tab`, and `tabbed-content-panel` for styling; toggle button uses the existing `.toggle-checkbox-btn` class.
- `decorateExternalLinks` (optional): Scans all links inside `.sl-markdown-content` and prepends a destination-specific icon to recognised link targets. Pass an object enabling each supported destination individually:
  - `youtube` (default: `false`): prepends a YouTube play-button SVG (class `yt-icon`, `aria-hidden`, inherits `currentColor`) to links pointing to `youtube.com` or `youtu.be`.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { starlightDomPatches } from "starlight-cannoli-plugins/starlight-dom-patches";

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

An Expressive Code plugin that highlights specific terms inside code blocks using the `emph` meta option. Matched terms are wrapped in a `<span class="fw-supreme">` and set in Source Code Pro at weight 900.

**Features:**

- Comma-separated list of terms to emphasize per code block
- Whole-word matching for letters, combining marks and digits in any script: `foo` doesn't match in `food`, and `na` doesn't match in `naïve`
- Terms can contain or be made of punctuation (e.g. `()`, `arr[0]`, `;`)
- Overlapping or duplicate terms never produce nested spans

**Usage:**

Register the plugin with Expressive Code:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { expressiveCodeEmphasis } from "starlight-cannoli-plugins/expressive-code-emphasis";

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

Then use the `emph` meta option on any code block:

````markdown
```js emph="foo,bar,()"
function foo() {
  return bar() || ();
}
```
````

Here `foo`, `bar` and all three `()` are emphasized.

Matching rules:

- Terms are comma-separated and trimmed, so a term can't contain a comma. Matching is case-sensitive.
- An edge of a term that is a word character can't sit against another word character. A word character is a letter, combining mark (such as the accent in a decomposed `é`), digit or `_`, in any script. An edge that is punctuation can sit against anything, so `()` matches in `foo()`, and `-` matches each dash in `--`.
- Matches never overlap. The one that starts first wins, and at the same start the longer term wins, so `emph="foo,foo.bar"` emphasizes `foo.bar` as one unit.

The plugin ships its own styles, so there's nothing else to import. The font is self-hosted: Source Code Pro at weight 900 is inlined into Expressive Code's stylesheet (about 38 KB), with no request to Google Fonts. It only covers the latin and latin-ext subsets, so other characters in an emphasized term (Greek or Cyrillic, for example) fall back to the browser's monospace font.

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

Every plugin has its own subpath (`starlight-cannoli-plugins/<plugin-name>`), as in the usage examples above. Prefer it over the root `starlight-cannoli-plugins` import, which loads every plugin's dependencies, including optional peers like `@expressive-code/core`.

## Styles

Every plugin ships its own styles and adds them to each page when you register it, so you don't need to add anything to `customCss` or install `sass`. Plugin styles sit in a `cannoli` cascade layer, above Starlight's layers and below unlayered CSS, so any rule in your own `customCss` overrides them, whatever its specificity.

The package also has two optional stylesheets. No plugin depends on either, so add only the ones you want:

- **Utility stylesheet** (`styles/utilities.css`): Bootstrap's utility classes (`d-flex`, `pe-1`, `align-middle` and so on) plus a few extra ones (`visibility-hidden`, `visible`, `flex-fill`), for use in your own content.
- **Starlight theme stylesheet** (`styles/starlight-theme.css`): changes to how Starlight itself looks. It covers a narrower content column, the TOC highlight, the search highlight colour, the `<details>` background, overflow scrolling for KaTeX and MathJax, dark-mode inversion for TikZ diagrams and `img.note-svg`, and the code-block copy button size.

```ts
// astro.config.mjs
starlight({
  customCss: [
    "starlight-cannoli-plugins/styles/utilities.css",
    "starlight-cannoli-plugins/styles/starlight-theme.css",
  ],
});
```

**Upgrading from 3.x:**

- `starlight-cannoli-plugins/styles/main.scss` and the rest of the `styles/*` export are gone, and you no longer need `sass` for them. In `customCss`, replace `main.scss` with the two stylesheets above, which together hold what `main.scss` did, minus the plugins' own styles. If you only had `main.scss` there for the plugins, remove it.
- The Starlight theme stylesheet's `<details>` rule now sets only vertical padding, so `starlightDomPatches`' horizontal padding on `<details>` shows through.
- Undocumented plugin classes now have a `cannoli-` prefix, so update any CSS of yours that targets them: `details-wrapper` is now `cannoli-details-wrapper` (`starlightDomPatches`), and `page-src-*` is now `cannoli-page-src-*` (`astroServeDocsFiles`). Documented classes keep their names.

## Peer Dependencies

- `astro` ≥ 5.0.0
- `@astrojs/markdown-remark` ^6 or ^7. Astro 5 already installs it. Astro 7 doesn't, but npm and pnpm install it automatically as a peer. With yarn, run `yarn add @astrojs/markdown-remark`.
- `@astrojs/starlight` ≥ 0.32.0 (optional, only needed if using `starlightIndexOnlySidebar` or `astroServeDocsFiles`)

## License

MIT

## Contributing

Contributions welcome! Feel free to open issues or submit pull requests.
