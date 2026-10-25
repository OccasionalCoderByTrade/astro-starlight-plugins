# 02: Register the tex compile transformer into the active Markdown processor

**Status:** ready-for-agent

**Blocked by:** 01

## Problem

`astroLatexCompile` registers its remark transformer with `updateConfig({ markdown: { remarkPlugins: [...existingPlugins, transformer] } })` (`src/plugins/astro-latex-compile/index.ts`, `astro:config:setup`). On Astro 7 that causes two problems.

**1. The transformer only runs if something else already put the site on `unified`.**

`markdown.remarkPlugins` is deprecated. Astro validates the config twice, once on the user's config and once after the integration hooks, and each pass first folds legacy `remarkPlugins` into a processor (`node_modules/astro/dist/core/config/validate.js`, `coerceLegacyMarkdownPlugins`):

- If the processor is unset or `unified`, the legacy plugins are moved into `unified`'s options and they run.
- If the processor is anything else, Astro warns once and drops them.

Which processor the second pass sees depends on the user's own config:

- User config has legacy `markdown.remarkPlugins`/`rehypePlugins` (e.g. `remarkMath`) and no `processor`: the first pass creates `unified()`, so the transformer runs. This is why the demo site worked.
- User config has none of those: the first pass does nothing, the schema defaults the processor to `satteri()` (`node_modules/astro/dist/core/config/schemas/base.js` ~L241), and the second pass drops the transformer. `tex compile` blocks render as plain code blocks. Confirmed by commenting out the `markdown` block in `astro.config.mjs`.
- User config sets `processor: satteri()` explicitly: same as above.

**2. The user's remark plugins are registered twice.**

The hook spreads `config.markdown.remarkPlugins` into its own array, and `updateConfig` merges arrays by concatenating them (`node_modules/astro/dist/core/config/merge.js` ~L54). With `remarkPlugins: [remarkMath]` the merged list is `[remarkMath, remarkMath, transformer]`. The first pass already folded one `remarkMath`, so the second pass folds the tail, `[remarkMath, transformer]`. Confirmed at runtime: on Astro 7.4.1 the final `unified` processor's `remarkPlugins` were `["remarkMath", "remarkMath", <transformer>, "remarkVscodeHeadingIds", "remarkDirective", ...]`.

## What to build

Register through the helper from ticket 01 (ADR 0017), which also removes the spread.

- **Core and adapters.** Split `transformer.ts` into a core that doesn't know about processors, and two thin adapters:
  - The core does the work per doc: find `tex compile` blocks, compile them in parallel, apply the "last `blockid` wins" debug image rule, produce one HTML string per block (diagram or tex compile error), and drive the ledger (`beginDoc`, `recordDoc`, `abandonDoc`, the last one always, even on a throw).
  - Remark adapter: `visit` + `splice`, as today.
  - Sätteri adapter: a factory entry that reads the doc's `fileURL` per document. Its `before` hook collects and compiles the blocks, a `code` visitor returns `{ raw, mdxExpressions: false }` for each block, and `after` records the doc in the ledger.
- **`texInputsHash`** stays in the config digest Astro uses to invalidate the content layer cache: the options of the `[attacher, { texInputsHash }]` tuple for `unified`, and a plain field on the Sätteri plugin object. Astro's `safeStringify` keeps both and drops functions.
- **`config:done`**: call `assertStillRegistered`.
- **README**: say that LaTeX compile works with both `unified()` and `satteri()`, and fails at startup on any other processor or one replaced by a later integration, like the heading IDs section does.

## Tests

- Run the transformer tests under both processors with `describe.each`, as `src/plugins/astro-vscode-heading-ids/index.test.ts` does. Cover at least a compiled diagram, a tex compile error with the right `file:line` (frontmatter offset included; Sätteri gets the body without frontmatter, as unified does, but confirm it), the "last `blockid` wins" rule, and ledger recording.
- Integration hook tests: startup throw on an unsupported processor, `config:done` throw on a replaced processor, the pre-Astro-7 fallback adding exactly one entry with no duplicated user plugins.
- Check in a browser on the demo site with the `markdown` block in `astro.config.mjs` removed (Sätteri) and restored (`unified`): `tex compile` blocks render as diagrams in both.

**Done when:** `npm test` and `npm run lib:build` pass, and the browser check passes on both processors.
