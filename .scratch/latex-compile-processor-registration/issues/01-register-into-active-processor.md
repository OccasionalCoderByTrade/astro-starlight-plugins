# 01: Register the tex compile transformer into the active Markdown processor

**What to build:** `astroLatexCompile` registers its remark transformer with `updateConfig({ markdown: { remarkPlugins: [...existingPlugins, transformer] } })` (`src/plugins/astro-latex-compile/index.ts`, `astro:config:setup`). On Astro 7 that causes two problems.

**1. The transformer only runs if something else already put the site on `unified`.**

`markdown.remarkPlugins` is deprecated. Astro validates the config twice, once on the user's config and once after the integration hooks, and each pass first folds legacy `remarkPlugins` into a processor (`node_modules/astro/dist/core/config/validate.js`, `coerceLegacyMarkdownPlugins`):

- If the processor is unset or `unified`, the legacy plugins are moved into `unified`'s options and they run.
- If the processor is anything else, Astro warns once and drops them.

Which processor the second pass sees depends on the user's own config:

- User config has legacy `markdown.remarkPlugins`/`rehypePlugins` (e.g. `remarkMath`) and no `processor`: the first pass creates `unified()`, so the transformer runs. This is why the demo site works.
- User config has none of those: the first pass does nothing, the schema defaults the processor to `satteri()` (`node_modules/astro/dist/core/config/schemas/base.js` ~L241), and the second pass drops the transformer. `tex compile` blocks render as plain code blocks. Confirmed by commenting out the `markdown` block in `astro.config.mjs`.
- User config sets `processor: satteri()` explicitly: same as above.

So the plugin works today only as a side effect of the user's other legacy config.

**2. The user's remark plugins are registered twice.**

The hook spreads `config.markdown.remarkPlugins` into its own array, and `updateConfig` merges arrays by concatenating them (`node_modules/astro/dist/core/config/merge.js` ~L54). With `remarkPlugins: [remarkMath]` the merged list is `[remarkMath, remarkMath, transformer]`. The first pass already folded one `remarkMath`, so the second pass folds the tail, `[remarkMath, transformer]`. Confirmed at runtime: on Astro 7.4.1 the final `unified` processor's `remarkPlugins` were `["remarkMath", "remarkMath", <transformer>, "remarkVscodeHeadingIds", "remarkDirective", ...]`.

**Fix:** do what `astroVscodeHeadingIds` does (ADR 0016). In `astro:config:setup`, check `config.markdown.processor.name` and push into `options.remarkPlugins` for `unified`, or push an mdast visitor adapter into `options.mdastPlugins` for `satteri`. Fail at startup for any other processor (ADR 0008). This also removes the spread, which fixes problem 2. Keep the `texInputsHash` cache-busting working. Today it rides along as the remark plugin's options, which are part of the config JSON Astro hashes.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Open questions:

- Does the transformer need anything a Sätteri mdast visitor can't do, such as async work per node, or replacing a `code` node with raw HTML? Sätteri visitors can be async and can return `{ raw, mdxExpressions: false }`.
- Where does `texInputsHash` go once the plugin isn't in `markdown.remarkPlugins`? Check whether processor options are part of the hashed config JSON.
