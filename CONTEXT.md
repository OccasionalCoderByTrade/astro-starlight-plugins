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
The failure of a `tex compile` block to produce a compiled tex diagram, shown in the page in place of the diagram.
_Avoid_: LaTeX compilation error, compile failure, error block
