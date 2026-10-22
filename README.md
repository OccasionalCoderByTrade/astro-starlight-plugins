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
- Fails `astro dev` and `astro build` at startup when an index file's frontmatter can't be parsed, a configured directory doesn't exist, or a directory under it can't be read

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
- Fails `astro dev` and `astro build` at startup when an index or linked page can't be read or its frontmatter can't be parsed

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

An Astro integration for the local links in your docs, meaning Markdown links (`[text](./other)`, `![alt](/img/logo.png)`) that to some other local file. It also handles `<a href>` and `<img src>` elements you write directly in your Markdown or MDX. It does two things, each of which you can turn off:

- **Link validation** fails on a local link in a page's content whose target doesn't exist.
- **Link normalization** rewrites relative links (`./other`, `../ref/page`) to root-absolute ones (`/guide/other`). A relative link in the HTML is resolved against the page's URL, so it can point somewhere different depending on whether your host adds a trailing slash. After normalization, a link means the same thing everywhere, and it matches what your editor opens on ctrl+click. It also rewrites a link to a source doc's file path, like `./List%20Syntax` for `List Syntax.md`, to the page path Starlight serves it at (`/guide/list-syntax`).

**Why write relative links at all?** Starlight's own docs write internal links as root-absolute URLs like `/guide/other/`. Those links work on the site, but if you write them in that manner, your editor and GitHub can't follow them back to the source file, because `/guide/other/` is a URL and not a file path. Relative links have the opposite problem: your editor follows them, but in the built HTML the browser resolves them against the page's URL, not its source file, and there exists no trailing-slash setting that makes it work for every page. With trailing slashes, `guide/intro.md` is served at `/guide/intro/`, so `./other` lands on `/guide/intro/other`. Without them, `guide/index.md` is served at `/guide`, so `./other` lands on `/other`. Link normalization lets you write links the way your editor reads them and still get links that work on the site.

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

- A source doc. `/reference/schemas` matches `reference/schemas.md(x)` or `reference/schemas/index.md(x)`, or any other extension Starlight loads (`.markdown`, `.mdown`...). `/reference/schemas/index` matches the latter too, as a file-form link (see [Non-slug filenames](#non-slug-filenames)), so link normalization rewrites it to `/reference/schemas`.
- A source doc by its file path, when its filename isn't a slug. See [Non-slug filenames](#non-slug-filenames) below.
- A file the site serves, like `/static/img/logo.png`. In `astro build` that's any file in the build output: files from `public/`, docs files that [Serve Docs Files](#serve-docs-files) serves, and whatever other integrations write. In `astro dev` it's a file in `public/`, or a file under `src/content/docs/` that Serve Docs Files would serve. Local Links finds Serve Docs Files by its integration name in Astro's `integrations` and uses the same served-file rule, so drafts, `_`- or `.`-prefixed files and `ignorePatterns` matches fail in dev just as they would in a build. Without Serve Docs Files installed, only `public/` counts in dev.

A file that sits next to your docs in `src/content/docs/` (a PDF, an image) only counts if the site serves it, because otherwise its URL would 404. [Serve Docs Files](#serve-docs-files) does that for you.

That includes source docs themselves. A link with the doc's extension, like `./auto-list-syntax.md`, is a **raw doc link**: it sends readers to the raw Markdown, not to the page built from it. It's never rewritten to the page path, so it only passes if the raw doc is served (a draft, for instance, isn't). If it isn't, the error says so and names the link to use for the page instead. To link to the page, drop the extension.

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
- A page, redirect or endpoint at a source doc's page path (such as one in `src/pages`) shadows that source doc: Astro serves it instead, and the source doc can't be reached. `astro dev` errors on that page, and `astro build` fails, listing every shadowed doc. This includes drafts, which become unreachable as soon as they stop being drafts. Astro also logs its own route conflict warning in `astro build`, and with `prerenderConflictBehavior: 'error'` Astro fails the build before this check runs. Setting it to `'ignore'` doesn't turn this check off. To serve a page in place of a source doc, delete the source doc or prefix its file name with `_`.
- A frontmatter `slug` and a custom `docsLoader({ generateId })` aren't supported. See [Non-slug filenames](#non-slug-filenames).

**Migrating from `rehypeValidateLinks` and `astroNormalizePaths`:**

Both are replaced by `astroLocalLinks` and now throw when called. Remove `rehypeValidateLinks` from `markdown.rehypePlugins` and `astroNormalizePaths()` from `integrations`, then add `astroLocalLinks()`. `rehypeValidateLinks`' `skipPatterns` moves to `astroLocalLinks({ validate: { skipPatterns } })`.

#### Non-slug filenames

Starlight serves each source doc at its page path, made by slugifying each segment of its file path. So `reference/List Syntax.md` is served at `/reference/list-syntax/`, and `My Guide/Intro.md` at `/my-guide/intro/`. You can link to a doc like that in two ways, and both pass link validation:

- **Page-form link**, the URL readers see: `/reference/list-syntax/`, or `./list-syntax` from a sibling doc.
- **File-form link**, the file path without its extension, URL-encoded: `./List%20Syntax`, or `/reference/List%20Syntax`. Your editor can follow these to the file.

Link normalization rewrites file-form links to the page path, URL-encoded where needed, so readers don't hit a 404. It keeps your trailing slash or lack of one, and any `?query#fragment`. With link normalization off, a file-form link is reported as broken, and the error names the page path to link to instead. A skip pattern skips a file-form link if it matches either its file form or its page path.

A link has to be exactly one of the two forms. One that only matches once slugified, like `/reference/LIST-syntax`, is broken, since hosts serve only the exact page path.

Slug filenames (`list-syntax.md`) are still simpler, because then the two forms are the same link. Non-slug filenames are there for files you'd rather not rename, like ones imported from a notes vault.

Two source docs with the same page path, like `Foo.md` and `foo.md`, `a b.md` and `a-b.md`, or `x.md` and `x/index.md`, are a page path collision. `astro build` fails before checking any page, listing every collision and its files, so you know which to rename. `astro dev` only errors on the colliding page and pages whose content links to it.

Page paths are worked out the way Starlight's docs loader does it by default. A frontmatter `slug` and a custom `docsLoader({ generateId })` change where Starlight serves a page, so they aren't supported. Pages that use them usually can't be matched to their source doc, and the integration throws.

### Serve Docs Files

Serves every file in the docs directory (`src/content/docs/`) at its path there, so a PDF or image next to a doc, or a doc's raw Markdown, can be linked to. `reference/paper.pdf` is served at `/reference/paper.pdf`, and `reference/List Syntax.md` at `/reference/List Syntax.md`, byte-for-byte with its frontmatter.

It does this through one prerendered `/[...path]` route that it adds to the site. In `astro dev` each file is read from its source on every request, so a saved edit shows up straight away. A file added during the session is served, and a deleted one 404s, without restarting the dev server. In `astro build` Astro writes each one into the build output like any other page. Nothing is copied into `public/` or deleted from it, so `public/` only holds the files you put there.

**What's served:**

- Every file under the docs directory, with a content type from its extension (`.md` and `.mdx` as `text/markdown`, unknown ones as `application/octet-stream`)
- Except drafts (`draft: true`), any file or directory whose name starts with `_` or `.` (like `_partial.md`, `_assets/` or `.obsidian/`) along with everything under one, and files matching `ignorePatterns`. Files next to a draft, and docs with `sidebar.hidden`, are still served.
- `astro dev` and `astro build` fail at startup when an md/mdx file's frontmatter can't be parsed, since the plugin can't tell whether the file is a draft. Once `astro dev` is running, saving such a file only logs an error, so the dev server keeps running.
- The docs directory is read from Astro's `srcDir`, so a custom `srcDir` works.

**Usage:**

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { astroServeDocsFiles } from "starlight-cannoli-plugins";

export default defineConfig({
  integrations: [astroServeDocsFiles(), starlight({ title: "My Docs" })],
});
```

**Options:**

- `ignorePatterns` (optional): Glob patterns for files not to serve. Patterns are matched against paths relative to `src/content/docs/`. A pattern that matches a directory leaves out everything under it.
- `exposePageSrcButton` (optional, default: `false`): Injects a client-side script on every page that adds a `⋮` dropdown next to the page's `<h1>` with "Copy Page", "Copy raw URL", and "View raw" actions for the page's raw markdown source.
- `enableAskAiOption` (optional, default: `false`): Adds "Ask ChatGPT", "Ask Claude", and "Ask Gemini" entries to the same `⋮` dropdown, each opening the respective chat app in a new tab with a prompt pre-filled to read the page's raw markdown URL. Independent of `exposePageSrcButton` — enabling this on its own still injects the dropdown button, containing only the "Ask" entries.

Both page-action options need raw docs to be served, so while either is on, an `ignorePatterns` value that matches `.md` or `.mdx` files fails at startup.

```ts
astroServeDocsFiles({
  ignorePatterns: ["**/*.txt", "**/drafts/**"],
  exposePageSrcButton: true,
  enableAskAiOption: true,
});
```

**Served-file rule:** the integration object has a `servedFileRule(relativePath)` field that says whether a path relative to the docs directory is served, by the rules above. It throws on unparseable frontmatter. Astro keeps only `name` and `hooks` of each integration in `config.integrations`, so the same function is also the `astro-serve-docs-files:served-file-rule` hook. Other integrations can find this one by name (`astro-serve-docs-files`) in `config.integrations`, read that hook, and call it once `astro:config:setup` has run.

**Upgrading to 4.0.0:**

- `syncDocsToPublic` is renamed `astroServeDocsFiles` (subpath export: `starlight-cannoli-plugins/astro-serve-docs-files`).
- `preserveDirs` is removed, since the plugin no longer deletes anything from `public/`. Drop it from your config.
- Delete the copies the old plugin left in `public/` (everything it synced from `src/content/docs/`), and any `.gitignore` rules you added for them. Until you do, `astro dev` and `astro build` fail at startup with a served path collision error (below) that lists each one.

**Served path collisions with `public/`:** a served docs file and a file in `public/` with the same path, like `src/content/docs/reference/notes.pdf` and `public/reference/notes.pdf`, can't both be served. `astro dev` and `astro build` fail at startup with one error listing every clash and both files of each. Files the plugin doesn't serve (drafts, `_`/`.`-prefixed, `ignorePatterns` matches) never clash. A clash created while `astro dev` is running shows the error at that URL only, and the dev server keeps running.

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
- `@astrojs/markdown-remark` ^6 or ^7. Astro 5 already installs it. Astro 7 doesn't, but npm and pnpm install it automatically as a peer. With yarn, run `yarn add @astrojs/markdown-remark`.
- `@astrojs/starlight` ≥ 0.30.0 (optional, only needed if using `starlightIndexOnlySidebar`)

## License

MIT

## Contributing

Contributions welcome! Feel free to open issues or submit pull requests.
