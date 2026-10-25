---
status: accepted
---

# VS Code heading IDs match VS Code with math on, and register into the active processor

`astroVscodeHeadingIds` gives each heading the id VS Code resolves a `#fragment` link to, so a link you can ctrl+click in the editor also works on the site. VS Code is the reference, not GitHub. Where the two differ, matching VS Code is correct, and GitHub's handling of math in headings couldn't be confirmed anyway.

The reference is VS Code with its default settings, where `markdown.math.enabled` is on. VS Code's markdown language service builds a heading's text from the parsed tokens and keeps only text, emoji and inline code. Math tokens aren't text, so math is dropped: `# Big $O(n^2)$ time` is `big--time`, and a heading that's only math gets an empty id. Inline HTML is dropped too, while image alt text and link text are kept. The plugin copies that text extraction and VS Code's slug function, duplicate numbering included, rather than relying on github-slugger's slugger, whose whitespace and duplicate handling differ in edge cases.

The plugin is an Astro integration, not a remark plugin. Astro 7 makes Sätteri the default Markdown processor and deprecates `markdown.remarkPlugins`. Sätteri silently drops a remark plugin, because it calls the plugin as a factory and gets nothing back. So the integration does what Starlight does. In `astro:config:setup` it checks `config.markdown.processor.name` and adds the right adapter to the processor's options: a remark plugin for `unified`, an mdast visitor for `satteri`. Both adapters share the same text extraction and slug code. Before Astro 7 there's no processor, so it falls back to `markdown.remarkPlugins`.

## Consequences

- Breaking release: the `remark-gfm-slug` export is removed with no shim.
- A processor other than `unified` or `satteri` fails dev and build at startup (ADR 0008), and so does one replaced by a later integration so the plugin is no longer in it at `astro:config:done`. Starlight only warns here, but a heading ID plugin that silently doesn't run is the bug this replaces.
- Its position in `integrations` doesn't matter. MDX reads the processor at `astro:config:done`, and `.md` rendering reads it lazily.
- A heading that already has an id keeps it, but its text still counts toward duplicate numbering, as it does in VS Code.
- Under Sätteri, math is opt-in (`features.math`). With it off, `$x$` is plain text and stays in the id, as it would in VS Code with `markdown.math.enabled` off.
- Markdoc doesn't run either processor's plugins, so `.mdoc` headings keep Markdoc's ids.

## Considered Options

- **GitHub as the reference.** Rejected: the point is links that work from the editor, and GitHub's math handling is unconfirmed.
- **Keep the TeX in the id (VS Code with math off).** Rejected: VS Code's default is math on.
- **Stay a remark plugin and document `unified({ remarkPlugins })`.** Rejected: it does nothing on the default processor.
- **Both an integration and a raw remark plugin export.** Rejected: two ways in, with no need for the second.
- **Warn on an unsupported processor, like Starlight.** Rejected: the warning is easy to miss, and every fragment link to a heading breaks.
