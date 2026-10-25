# 01: Register the tex compile transformer into the active Markdown processor

**What to build:** `astroLatexCompile` registers its remark transformer with `updateConfig({ markdown: { remarkPlugins: [...existingPlugins, transformer] } })` (`src/plugins/astro-latex-compile/index.ts`, `astro:config:setup`). On Astro 7 that has two problems:

- `markdown.remarkPlugins` is deprecated. Astro reruns its legacy-plugin coercion after the hooks (`node_modules/astro/dist/core/config/validate.js` ~L37-91). If the processor is Sätteri, the default, it only warns and the transformer never runs, so `tex compile` blocks would render as plain code blocks.
- `updateConfig` merges arrays by concatenating them (`node_modules/astro/dist/core/config/merge.js` ~L54), so spreading `existingPlugins` likely registers the user's remark plugins twice. Not verified at runtime.

Fix it the way `astroVscodeHeadingIds` does (ADR 0016): in `astro:config:setup`, check `config.markdown.processor.name` and push into `options.remarkPlugins` for `unified`, or push an mdast visitor adapter into `options.mdastPlugins` for `satteri`. Fail at startup for any other processor (ADR 0008). Keep the `texInputsHash` cache-busting working: today it rides along as the remark plugin's options, which are part of the config JSON Astro hashes.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Open questions:

- Does the transformer need anything a Sätteri mdast visitor can't do, such as async work per node, or replacing a `code` node with raw HTML? Sätteri visitors can be async and can return `{ raw, mdxExpressions: false }`.
- Where does `texInputsHash` go once the plugin isn't in `markdown.remarkPlugins`? Check whether processor options are part of the hashed config JSON.
