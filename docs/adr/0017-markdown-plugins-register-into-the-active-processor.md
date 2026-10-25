---
status: accepted
---

# Markdown plugins register into the active processor

Every plugin that transforms Markdown (today `astroVscodeHeadingIds` and `astroLatexCompile`) registers itself into whichever Markdown processor the site uses, through one shared helper in `src/plugins/utils/`. The helper only decides where the plugin goes. Each plugin still owns its own hooks and calls the helper from them.

Astro 7 makes Sätteri the default processor and deprecates `markdown.remarkPlugins`. Astro folds legacy remark plugins into `unified` when the site is on `unified`, or when the site hasn't picked a processor yet at the moment Astro validates the config. Otherwise it warns once and drops them. So a plugin that registers through `markdown.remarkPlugins` runs or not depending on what else is in the user's config. `astroLatexCompile` only worked on the demo site because `remarkMath` was in its `markdown.remarkPlugins`. Without it, `tex compile` blocks rendered as plain code.

Each plugin provides two adapters over shared logic: a remark plugin and a Sätteri mdast plugin. In `astro:config:setup` the helper reads `config.markdown.processor.name`:

- `unified`: push the remark plugin into the processor's `remarkPlugins`.
- `satteri`: push the mdast plugin into the processor's `mdastPlugins`.
- No processor (before Astro 7): add the remark plugin with `updateConfig({ markdown: { remarkPlugins: [plugin] } })`. Only the plugin is passed, never the existing list, because `updateConfig` concatenates arrays and spreading the list registers the user's plugins a second time.
- Anything else: throw.

In `astro:config:done` the helper checks that the plugin is still in the processor, and throws if an integration listed later replaced it.

## Consequences

- A processor other than `unified` or `satteri`, or one replaced by a later integration, fails dev and build at startup (ADR 0008). A Markdown plugin that silently doesn't run produces broken output that's hard to trace back to its cause.
- A plugin's position in `integrations` doesn't matter. MDX reads the processor at `astro:config:done`, and `.md` rendering reads it lazily.
- Whatever has to invalidate the content layer cache (such as `astroLatexCompile`'s tex inputs hash) must live in plain data on the registered plugin: the options of a `[plugin, options]` tuple for `unified`, or a field on the mdast plugin object for `satteri`. Astro hashes the config, processor options included, but drops functions.
- Markdoc doesn't run either processor's plugins, so these plugins don't apply to `.mdoc` files.

## Considered Options

- **Register through `markdown.remarkPlugins` only.** Rejected: on the default processor the plugin never runs.
- **Support `unified` only and throw on Sätteri.** Rejected: every site on Astro 7's default would fail at startup until it switched processors.
- **Warn on an unsupported processor, like Starlight.** Rejected: the warning is easy to miss among startup output.
- **Each plugin carries its own copy of the registration logic.** Rejected once a second plugin needed it: the branching and error messages would drift apart.
