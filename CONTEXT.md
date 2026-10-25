# Starlight Cannoli Plugins

A collection of Astro integrations and Starlight plugins for documentation sites, shipped as one npm package.

## Language

### LaTeX compile

**`tex compile` block**:
A fenced code block in a Markdown doc, tagged `tex` or `latex` with `compile` in its meta, that holds a complete LaTeX document to be rendered as a diagram. `latex compile` is an accepted spelling in source, but prose always says `tex compile` block.
_Avoid_: LaTeX block, compile block, code block, `latex compile` block (in prose)

**Compiled tex diagram**:
The SVG produced from one `tex compile` block, named by the hash of its content.
_Avoid_: tex SVG, compiled SVG, diagram

**Compile mode**:
The route a `tex compile` block takes to become a compiled tex diagram, set per block with `mode=`. `dvi` (the default) keeps the compiled tex diagram's text as real, selectable text. `pdf` turns all text into shapes, but accepts graphics that `dvi` can't, such as PNG or PDF images.
_Avoid_: engine, output format, render mode

**Orphaned tex diagram**:
A compiled tex diagram that no `tex compile` block references anymore.
_Avoid_: orphaned SVG, stale SVG (the `removeOrphanedSvgs` option keeps its name for compatibility)

**Tex input dir**:
A directory, listed in the `texInputDirs` option, that `tex compile` blocks can pull files from. Apart from TeX's installed packages, it is the only place outside the block itself that a block can read from.
_Avoid_: include dir, shared dir, external dependency dir

**Tex input file**:
A file in a tex input dir that a `tex compile` block pulls in, through `\input`, `\include`, `\usepackage`, `\includegraphics` or similar. Changing any tex input file changes every compiled tex diagram.
_Avoid_: external file dependency, shared file, include

**Debug tex diagram image**:
A JPEG copy of a compiled tex diagram, produced only for `tex compile` blocks that carry a `blockid`, meant for local inspection and never published.
_Avoid_: debug JPG, temp output, snapshot

**Tex compile error**:
The failure of a `tex compile` block to produce a compiled tex diagram. In dev it is shown in the page in place of the diagram; it fails `astro build`.
_Avoid_: LaTeX compilation error, compile failure, error block

### Local links

**Local link**:
An `<a href>` or `<img src>` on a page that points to somewhere inside the site, whether written relative (`./other`) or root-absolute (`/some/page`).
_Avoid_: internal link, path, asset path

**Link validation**:
Checking that a local link's target exists among the site's source docs and files.
_Avoid_: link check, link verification

**Link normalization**:
Rewriting a relative local link into a root-absolute one, so it means the same thing whether or not the host adds a trailing slash to the page's URL, and rewriting a file-form link into a page-form link.
_Avoid_: path normalization, link resolution

**Source doc**:
The Markdown, MDX or Markdoc file a page was rendered from. A `.markdown`, `.mdown`, `.mkdn`, `.mkd` or `.mdwn` file never becomes a page, so it's a docs asset.
_Avoid_: source file, content file

**Page path**:
The URL path Starlight serves a source doc at, made by slugifying each segment of the source doc's path.
_Avoid_: slug, route, URL

**Page path collision**:
A page path that more than one source doc has, such as `Foo.md` and `foo.md`, or `x.md` and `x/index.md`. It fails the build, and in dev the pages it affects.
_Avoid_: ambiguous source docs, duplicate page

**Doc route**:
The single route Starlight serves every source doc's page from, except a custom `404.md`.
_Avoid_: docs route, slug route, catch-all

**Shadowed doc**:
A source doc whose page path another route serves in place of the route Starlight renders it through, such as a `src/pages` page at the same path, so the source doc's page can't be reached. Starlight renders a custom `404.md` through its 404 route, so that one isn't shadowed.
_Avoid_: overridden doc, route conflict

**Non-slug path**:
A source doc path that differs from its page path, such as `reference/List Syntax.md` served at `/reference/list-syntax/`.
_Avoid_: unslugified path, raw path

**File-form link**:
A local link to a source doc written as the source doc's path without its extension, so an editor can follow it. It means the source doc's page.
_Avoid_: file link, raw link

**Raw doc link**:
A local link to a source doc written as the source doc's path with its extension, such as `./auto-list-syntax.md`. It means the raw doc, never the page, so it only works when the raw doc is served.
_Avoid_: source link, source-file link, file-form link (with extension)

**Raw doc**:
A source doc served as-is at its source path, such as `/reference/auto-list-syntax.md`, rather than rendered into a page.
_Avoid_: raw Markdown, source copy, public copy

**Raw doc alternate link**:
The `<link rel="alternate" type="text/markdown">` in a page's head that names its raw doc. Only a page whose raw doc is served has one, and the page-action bar reads it.
_Avoid_: raw doc link tag, meta tag

**Page-action bar**:
The menu on a page that offers its raw doc (copy it, copy its URL, view it) and asks an AI chat app about it. A page whose raw doc isn't served has no page-action bar.
_Avoid_: action menu, page src button, dropdown

**Docs asset**:
A file under the docs directory that isn't a source doc, such as a PDF or image, served at its path relative to that directory.
_Avoid_: public file, synced file, static file, attachment

**Served path collision**:
A served path that a raw doc or docs asset shares with a file in `public/` or with another route's output, such as `public/reference/notes.pdf` next to `src/content/docs/reference/notes.pdf`, or a docs `zap/index.html` next to a `src/pages/zap.astro` page. It fails the build. One with a `public/` file also fails dev at startup.
_Avoid_: public collision, shadowed asset

**Page-form link**:
A local link to a source doc written as its page path.
_Avoid_: slug link, URL link

### Heading IDs

**Heading ID**:
The id on a page's heading that a `#fragment` link targets.
_Avoid_: slug, anchor, heading slug

**VS Code heading ID**:
A heading ID that matches the fragment VS Code resolves when following the same link in the source doc.
_Avoid_: GFM slug, GitHub heading ID

### Sidebars

**Sidebar index**:
The index source doc of a directory (`index.md`, `index.mdx` or `index.mdoc`) whose links define that directory's sidebar group, in the order they're written.
_Avoid_: index file, index page, index.md

**Index entry**:
The sidebar entry for a sidebar index itself. It comes first in its group and carries the index marker, if one is set.
_Avoid_: index item, overview entry

**Sub-index link**:
A link in a sidebar index to another directory's sidebar index, written as `./sub/index` or `./sub/`. It becomes a nested group, unless the target is a leaf index or the group would go past the maximum number of group levels.
_Avoid_: index link, nested link

**Leaf index**:
A sidebar index whose frontmatter opts it out of being expanded. A sub-index link to it becomes a single entry instead of a nested group, so its own links don't affect the sidebar.
_Avoid_: mdx index, landing page

**Hidden from sidebar**:
A source doc with `draft: true` or `sidebar.hidden: true` in its frontmatter. It gets no sidebar entry in dev or build. A sidebar index that's hidden from sidebar takes its whole group with it.
_Avoid_: excluded, unlisted

**Sidebar index chain**:
The sidebar indexes a sidebar is being built through, from a root sidebar index down to the current one, following sub-index links. A sub-index link to a sidebar index already in the chain is a loop (`guides/` links `../shared/`, which links `../guides/`), and is skipped with a warning.
_Avoid_: ancestor sidebar index, ancestor chain

**Ancestor link**:
A link in a sidebar index to its own directory, or to a directory above it up to the docs root, or to one of those directories' sidebar indexes (`.`, `..`, `../index.md`, `/`). It's skipped with a warning, whether or not the directory is in the sidebar index chain. A link that goes up and then sideways or down (`../setup.md`) isn't one.
_Avoid_: back link, parent link, upward link

**Link scope**:
Where a sidebar index's links may point, set by the `linkScope` option: `anywhere` in the docs root, or only `below`, inside the sidebar index's own directory.
_Avoid_: link boundary, link range

### Expressive Code emphasis

**Expressive Code Emphasis Term**:
A string listed in a code block's `emph` meta, comma-separated, whose every whole-unit occurrence in the block is emphasized. A term edge that is a letter, combining mark, digit or `_` can't sit against another one; an edge that is punctuation can sit against anything. Where two terms' occurrences overlap, the one that starts first wins, and at the same start the longer one.
_Avoid_: emph word, highlight term, keyword

### Styles

**Plugin styles**:
The CSS a plugin ships for the markup it emits. It applies whenever the plugin is registered, with nothing for the site to import.
_Avoid_: plugin CSS, injected styles

**Shared component**:
A piece of styled markup that two or more plugins emit, so its styles belong to no single plugin.
_Avoid_: shared class, common component

**Design token**:
A `--cannoli-*` custom property holding a value shared by plugin styles, plugin scripts and opt-in stylesheets, such as an error colour.
_Avoid_: CSS variable, theme variable, Sass variable

**Opt-in stylesheet**:
A stylesheet the package exports for a site to add to its own styles: the utility stylesheet or the Starlight theme stylesheet. No plugin depends on one.
_Avoid_: shared stylesheet, main stylesheet, `main.scss`, `index.scss`

**Utility stylesheet**:
The opt-in stylesheet of utility classes, such as `d-flex` or `pe-1`.
_Avoid_: Bootstrap stylesheet

**Starlight theme stylesheet**:
The opt-in stylesheet that changes how Starlight's own markup looks, such as the TOC highlight or the `<details>` background.
_Avoid_: Starlight overrides, site theme, demo site styles
