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
The Markdown or MDX file a page was rendered from.
_Avoid_: source file, content file

**Page path**:
The URL path Starlight serves a source doc at, made by slugifying each segment of the source doc's path.
_Avoid_: slug, route, URL

**Page path collision**:
A page path that more than one source doc has, such as `Foo.md` and `foo.md`, or `x.md` and `x/index.md`. It fails the build, and in dev the pages it affects.
_Avoid_: ambiguous source docs, duplicate page

**Doc route**:
The single route Starlight serves every source doc's page from.
_Avoid_: docs route, slug route, catch-all

**Shadowed doc**:
A source doc whose page path is served by a route other than the doc route, such as a `src/pages` page at the same path, so the source doc's page can't be reached.
_Avoid_: overridden doc, route conflict

**Non-slug path**:
A source doc path that differs from its page path, such as `reference/List Syntax.md` served at `/reference/list-syntax/`.
_Avoid_: unslugified path, raw path

**File-form link**:
A local link to a source doc written as the source doc's path, so an editor can follow it.
_Avoid_: file link, raw link

**Page-form link**:
A local link to a source doc written as its page path.
_Avoid_: slug link, URL link
