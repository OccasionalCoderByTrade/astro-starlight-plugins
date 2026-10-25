# 02: LaTeX compile registers into `unified` through the helper

**What to build:** `astroLatexCompile` registers through the shared helper from ticket 01 instead of copying `markdown.remarkPlugins` into an `updateConfig` call.

- On `unified`, and before Astro 7, `tex compile` blocks render as compiled tex diagrams, and the site's own remark plugins run once per doc instead of twice.
- Any other processor, or one that a later integration replaces, fails startup loudly.
- Until ticket 03 lands, Sätteri counts as unsupported here and also throws at startup. That's temporary within this branch and still better than rendering raw LaTeX in silence.

To get there, the transformer is split into a core that doesn't know about either processor and a thin remark adapter (see the spec's Implementation Decisions). The core handles, per doc:

- finding blocks
- meta options (`mode`, `blockid`, `class`, `alt`)
- parallel compile
- the "last `blockid` wins" rule
- producing one HTML string per block
- driving the ledger: begin, record, and always abandon

The tex inputs hash travels as the options of the `[attacher, options]` tuple, so it stays in the config Astro hashes.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Registration goes only through the helper. There's no `updateConfig` call that copies existing remark plugins.
- [ ] The core has no knowledge of `unified` or Sätteri, and the remark adapter only walks the tree and splices the core's HTML in.
- [ ] The existing LaTeX compile tests that call the transformer directly move up to the spec's seam: run the config hooks against a real `unified()` processor, then render through it. Tests that need TeX stay skipped when it's missing.
- [ ] At that seam, under `unified`: compiled tex diagram, tex compile error with the right `file:line` (frontmatter included), "last `blockid` wins", ledger recording, and the build failing at `astro:build:done` with every tex compile error.
- [ ] Registration cases at that seam: the pre-Astro-7 fallback adds exactly one entry, an unsupported processor throws at startup, and a replaced processor throws at `config:done`.
- [ ] Changing a tex input file still changes the registered plugin's hashed options.
- [ ] Demo site with the `markdown` block in `astro.config.mjs` restored: `tex compile` blocks render as diagrams in the browser, and `remarkMath` appears once in the final `unified` processor.
- [ ] Demo site with the `markdown` block removed: `astro dev` fails at startup naming the processor.
- [ ] `npm test` and `npm run lib:build` pass.

## Background

The runtime evidence behind the spec's problem statement, from Astro 7.4.1:

- Astro validates the config twice, once on the user's config and once after integration hooks. Each pass folds legacy `remarkPlugins` into `unified` if the processor is unset or `unified`, and otherwise warns once and drops them. A user config without legacy plugins gets `satteri()` from the schema default after the first pass, so the second pass drops LaTeX compile's transformer. This was confirmed by commenting out the demo site's `markdown` block: `tex compile` blocks rendered as raw code.
- `updateConfig` concatenates arrays. The old hook spread the existing `[remarkMath]` into its update, giving `[remarkMath, remarkMath, transformer]`. The second pass folded the tail past the one plugin already folded, so `remarkMath` ran twice. Confirmed at runtime: the final `unified` processor's `remarkPlugins` were `["remarkMath", "remarkMath", <transformer>, "remarkVscodeHeadingIds", "remarkDirective", ...]`.
