---
status: accepted
---

# Tex input dirs are a block's only dependencies

A compiled tex diagram is named by a hash, and a prod build without a TeX toolchain only works if every hash it computes matches a compiled tex diagram that was committed from a dev machine. So everything a `tex compile` block can read has to be part of that hash, and has to hash the same on both machines.

That's why `pdflatex` runs from its temp dir with kpathsea's paranoid mode (`openin_any=p`): a block can only read tex input files by name from its tex input dirs (and TeX's installed packages), never by a path relative to the project, an absolute path, or `..`. One hash of every tex input file's path (relative to the project root) and contents is folded into every block's hash, so changing any tex input file recompiles every compiled tex diagram. Dotfiles, dot-dirs and LaTeX build artifacts don't count, since a checkout elsewhere usually doesn't have them. A missing tex input dir fails `astro dev`, but `astro build` only warns: git drops empty dirs, so prod can lack a dir that is empty on the dev machine and still find every compiled tex diagram.

In dev, cached docs aren't re-rendered (ADR-0002), so the integration watches each tex input file with `addWatchFile` and registers its remark plugin as `[plugin, { texInputsHash }]`. Astro clears its content store whenever the JSON of its config changes, and plugin options are part of it, so a changed tex input file re-renders every doc, both after the watcher's restart and on a cold start.

## Considered Options

- **Per-block dependency tracking** (recompile only the blocks that read a changed file). Rejected: what a block reads is only known after compiling it, so it needs a persisted dependency record, and tex input files change rarely.
- **Hash only git-tracked files.** Rejected: needs `git` in the prod build, and an uncommitted edit to a tex input file would be silently ignored locally.
- **Save the hash in the codegen dir and delete Astro's `data-store.json` when it changes.** Rejected: an in-process dev restart keeps the content store in memory and writes it back, so the stale renders survived.
- **Drop `texInputDirs`.** Rejected: it's a published option, and without it the only way to share macros is pasting them into every block.
